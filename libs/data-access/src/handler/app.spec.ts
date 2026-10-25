import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { DATA_ACTIONS, DATA_USER_TOKEN_HEADER, type DataResult } from '@griever/shared';
import { encodeMember, encodeMemberOf } from '../items/memberItems.js';
import { encodeProfile } from '../items/profileItem.js';
import { acceptInvite } from '../rules/acceptInvite.js';
import { createFlow, listFlows, updateFlow } from '../rules/flows.js';
import { createInvite, revokeInvite } from '../rules/invites.js';
import { listMembers, removeMember } from '../rules/members.js';
import { getProfile, putProfile } from '../rules/profiles.js';
import { createTables, doc, dropTables, rawPut, table, up } from '../testing/localTable.js';
import type { Caller } from '../caller.js';
import type { DataRules } from './actions.js';
import { createDataApp } from './app.js';

const TOKEN = 'header.payload.signature-do-not-leak';
const OWNER: Caller = { userId: 'user_app_owner', email: 'pat@example.test', emailVerified: true };
const MEMBER_ID = 'user_app_member';
const FLOW_ID = '33333333-3333-4333-8333-333333333333';
const HASH = 'c'.repeat(64);
const ACCEPT_HASH = 'd'.repeat(64);
const FACTS = {
  personName: 'Grandma',
  dateOfPassing: null,
  serviceDate: null,
  obituaryUrl: null,
  obituaryPublisher: null,
  serviceReady: false,
};

// The guard tests and the 500 test use a stub for acceptInvite so they can see whether it was called.
const acceptStub = vi.fn<DataRules['acceptInvite']>(async () => ({ ok: true, value: { ownerId: OWNER.userId } }));
const rules: DataRules = {
  getProfile,
  putProfile,
  listFlows,
  createFlow,
  updateFlow,
  createInvite,
  revokeInvite,
  listMembers,
  removeMember,
  acceptInvite,
};
const guardRules: DataRules = { ...rules, acceptInvite: acceptStub };

const JOINER_TOKEN = 'joiner.token.value';
const JOINER: Caller = { userId: 'user_app_joiner', email: 'joiner@example.test', emailVerified: true };
const callers = new Map<string, Caller>([[TOKEN, OWNER], [JOINER_TOKEN, JOINER]]);
const verify = vi.fn(async (token: string): Promise<Caller | null> => callers.get(token) ?? null);
const onError = vi.fn();
const app = createDataApp({ rules, doc, table, verify, onError });

async function call(body: unknown, headers: Record<string, string> = { [DATA_USER_TOKEN_HEADER]: TOKEN }) {
  return app.request('/v1', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

async function act(action: string, args: Record<string, unknown> = {}, token = TOKEN): Promise<DataResult> {
  const response = await call({ action, args }, { [DATA_USER_TOKEN_HEADER]: token });
  expect(response.status).toBe(200);
  return (await response.json()) as DataResult;
}

// These guards must hold in every CI job, so they run on a document client that fails the test if it is used.
const stub = { send: vi.fn() };
const guardApp = createDataApp({ rules: guardRules, doc: stub as unknown as DynamoDBDocumentClient, table: 'guard', verify, onError });

async function callGuard(body: unknown, headers: Record<string, string> = { [DATA_USER_TOKEN_HEADER]: TOKEN }) {
  return guardApp.request('/v1', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

describe('guards before DynamoDB', () => {
  beforeEach(() => {
    stub.send.mockClear();
    onError.mockClear();
    acceptStub.mockClear();
  });

describe('the user token (no DynamoDB)', () => {
  it.each([
    ['is missing', {}],
    ['is empty', { [DATA_USER_TOKEN_HEADER]: '' }],
    ['is wrong', { [DATA_USER_TOKEN_HEADER]: 'a.b.c' }],
    ['is in Authorization instead', { authorization: `Bearer ${TOKEN}` }],
  ])('answers 401 with no DynamoDB call when it %s', async (_name, headers) => {
    const response = await callGuard({ action: 'listFlows', args: {} }, headers);
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'unauthorized' });
    expect(stub.send).not.toHaveBeenCalled();
  });

  it('answers 401 before it reads a bad body', async () => {
    expect((await callGuard('{not json', {})).status).toBe(401);
  });

  it('answers 500 with no detail when the verifier itself fails', async () => {
    verify.mockRejectedValueOnce(new Error('keys down for pat@example.test'));
    const response = await callGuard({ action: 'listFlows', args: {} });
    expect(response.status).toBe(500);
    expect(await response.text()).toBe('{"error":"internal"}');
    expect(stub.send).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith('verify', 'Error');
  });
});

describe('input checks (C8, no DynamoDB)', () => {
  it.each([
    ['a body that is not JSON', '{nope'],
    ['an empty body', ''],
    ['an array', []],
    ['a missing args', { action: 'listFlows' }],
    ['a missing action', { args: {} }],
    ['an extra envelope key', { action: 'listFlows', args: {}, extra: 1 }],
    ['args that is an array', { action: 'listFlows', args: [] }],
    ['an action that is not a string', { action: 5, args: {} }],
    ['an unknown action', { action: 'dropEverything', args: {} }],
    ['deleteUserData', { action: 'deleteUserData', args: {} }],
  ])('answers 400 with no DynamoDB call for %s', async (_name, body) => {
    const response = await callGuard(body);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'bad_request' });
    expect(stub.send).not.toHaveBeenCalled();
  });

  it('answers 400 before any call when createFlow has an unknown key', async () => {
    const response = await callGuard({ action: 'createFlow', args: { id: FLOW_ID, facts: { ...FACTS, ownerId: 'user_x' } } });
    expect(response.status).toBe(400);
    expect(stub.send).not.toHaveBeenCalled();
  });

  it('answers 400 before any call for bad args of other actions', async () => {
    for (const body of [
      { action: 'createFlow', args: { id: 'nope', facts: FACTS } },
      { action: 'updateFlow', args: { id: FLOW_ID, patch: { updatedBy: 'x' } } },
      { action: 'createInvite', args: { email: 'nope', tokenHash: HASH } },
      { action: 'removeMember', args: { memberId: 'user#x' } },
      { action: 'acceptInvite', args: { tokenHash: 'abc' } },
      { action: 'listFlows', args: { ownerId: 'user_x' } },
    ]) {
      expect((await callGuard(body)).status).toBe(400);
    }
    expect(stub.send).not.toHaveBeenCalled();
    expect(acceptStub).not.toHaveBeenCalled();
  });

  it('serves POST /v1 only', async () => {
    expect((await guardApp.request('/v1', { method: 'GET' })).status).toBe(404);
    expect((await guardApp.request('/v2', { method: 'POST', headers: { [DATA_USER_TOKEN_HEADER]: TOKEN } })).status).toBe(404);
    expect((await guardApp.request('/', { method: 'POST', headers: { [DATA_USER_TOKEN_HEADER]: TOKEN } })).status).toBe(404);
    expect(stub.send).not.toHaveBeenCalled();
  });
});

  it('answers 500 with no detail, and logs the class only, for an error Hono catches', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const app = createDataApp({ rules: guardRules, doc: stub as unknown as DynamoDBDocumentClient, table: 'guard', verify, onError });
    app.get('/boom', () => {
      throw new RangeError('secret detail pat@example.test');
    });
    const response = await app.request('/boom');
    const consoleCalls = spy.mock.calls.length;
    spy.mockRestore();
    expect(response.status).toBe(500);
    expect(await response.text()).toBe('{"error":"internal"}');
    expect(onError).toHaveBeenCalledWith('unhandled', 'RangeError');
    expect(consoleCalls).toBe(0);
  });
});

describe.runIf(up)('data app on DynamoDB Local', () => {
  const send = vi.spyOn(doc, 'send');
  const now = new Date().toISOString();

  beforeAll(async () => {
    await createTables();
    // A member of the owner, so removeMember has someone to remove.
    await rawPut(encodeProfile({ userId: MEMBER_ID, accountType: 'member', version: 1, createdAt: now, updatedAt: now }));
    await rawPut(encodeMember({ ownerId: OWNER.userId, memberId: MEMBER_ID, email: 'helper@example.test', createdAt: now }));
    await rawPut(encodeMemberOf({ memberId: MEMBER_ID, ownerId: OWNER.userId, createdAt: now }));
  });

  afterAll(async () => {
    await dropTables();
  });

  beforeEach(() => {
    send.mockClear();
    onError.mockClear();
  });

  describe('one happy path per action', () => {
    it('getProfile and putProfile', async () => {
      expect(await act('getProfile')).toEqual({ ok: true, data: null });
      const saved = await act('putProfile', { fields: { senderName: 'Pat' } });
      expect(saved).toMatchObject({ ok: true, data: { userId: OWNER.userId, senderName: 'Pat' } });
      expect(await act('getProfile')).toMatchObject({ ok: true, data: { senderName: 'Pat' } });
    });

    it('createFlow, listFlows and updateFlow', async () => {
      expect(await act('createFlow', { id: FLOW_ID, facts: FACTS })).toMatchObject({
        ok: true,
        data: { id: FLOW_ID, ownerId: OWNER.userId, role: 'owner' },
      });
      expect(await act('listFlows')).toMatchObject({ ok: true, data: [{ id: FLOW_ID }] });
      expect(await act('updateFlow', { id: FLOW_ID, patch: { personName: 'Nana' } })).toMatchObject({
        ok: true,
        data: { id: FLOW_ID, facts: { personName: 'Nana' } },
      });
    });

    it('createInvite, listMembers and revokeInvite', async () => {
      const created = await act('createInvite', { email: 'Friend@Example.test', tokenHash: HASH });
      expect(created).toMatchObject({ ok: true, data: { email: 'friend@example.test' } });
      const inviteId = (created as { data: { id: string } }).data.id;
      expect(await act('listMembers')).toMatchObject({ ok: true, data: { role: 'owner' } });
      expect(await act('revokeInvite', { id: inviteId })).toEqual({ ok: true, data: null });
    });

    it('removeMember', async () => {
      expect(await act('removeMember', { memberId: MEMBER_ID })).toEqual({ ok: true, data: null });
    });

    it('acceptInvite, with the real rule: the invited, verified joiner becomes a member', async () => {
      const invited = await act('createInvite', { email: JOINER.email, tokenHash: ACCEPT_HASH });
      expect(invited).toMatchObject({ ok: true });
      expect(await act('acceptInvite', { tokenHash: ACCEPT_HASH }, JOINER_TOKEN)).toEqual({
        ok: true,
        data: { ownerId: OWNER.userId },
      });
      expect(await act('listMembers', {}, JOINER_TOKEN)).toMatchObject({ ok: true, data: { role: 'member' } });
    });

    it('acceptInvite answers 200 with unusable for an unknown token and for one already used', async () => {
      expect(await act('acceptInvite', { tokenHash: 'e'.repeat(64) }, JOINER_TOKEN)).toEqual({ ok: false, code: 'unusable' });
      expect(await act('acceptInvite', { tokenHash: ACCEPT_HASH }, JOINER_TOKEN)).toEqual({ ok: false, code: 'unusable' });
    });

    it('has a happy path for every action in DATA_ACTIONS', () => {
      // Keep in step with the tests above: a new action needs a path here.
      const covered = ['getProfile', 'putProfile', 'createFlow', 'listFlows', 'updateFlow', 'createInvite', 'listMembers', 'revokeInvite', 'removeMember', 'acceptInvite'];
      expect([...covered].sort()).toEqual([...DATA_ACTIONS].sort());
    });
  });

  describe('outcomes', () => {
    it('answers a domain refusal with 200 and the code only', async () => {
      const result = await act('updateFlow', { id: '99999999-9999-4999-8999-999999999999', patch: { personName: 'X' } });
      expect(result).toEqual({ ok: false, code: 'not_found' });
    });

    it('answers an unexpected error with 500, no detail, and a log line without the secrets', async () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const loud = createDataApp({
        rules: { ...guardRules, acceptInvite: async () => { throw new Error(`boom ${OWNER.email} ${HASH} ${TOKEN}`); } },
        doc,
        table,
        verify,
      });
      const response = await loud.request('/v1', {
        method: 'POST',
        headers: { [DATA_USER_TOKEN_HEADER]: TOKEN },
        body: JSON.stringify({ action: 'acceptInvite', args: { tokenHash: HASH } }),
      });
      expect(response.status).toBe(500);
      const body = await response.text();
      expect(body).toBe('{"error":"internal"}');
      const logged = JSON.stringify(spy.mock.calls);
      spy.mockRestore();
      expect(logged).toContain('acceptInvite');
      for (const secret of [TOKEN, OWNER.email, HASH, 'boom']) {
        expect(logged).not.toContain(secret);
        expect(body).not.toContain(secret);
      }
    });

    it('never puts the token in an error response', async () => {
      for (const response of [
        await call({ action: 'nope', args: {} }),
        await call('{nope'),
        await call({ action: 'updateFlow', args: { id: '99999999-9999-4999-8999-999999999999', patch: { personName: 'X' } } }),
      ]) {
        const text = await response.text();
        expect(text).not.toContain(TOKEN);
        expect(text).not.toContain(OWNER.email);
      }
    });
  });
});
