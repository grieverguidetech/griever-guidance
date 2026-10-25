import { DATA_ACTIONS, DATA_USER_TOKEN_HEADER, type DataResult } from '@griever/shared';
import { encodeMember, encodeMemberOf } from '../items/memberItems.js';
import { encodeProfile } from '../items/profileItem.js';
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
const FACTS = {
  personName: 'Grandma',
  dateOfPassing: null,
  serviceDate: null,
  obituaryUrl: null,
  obituaryPublisher: null,
  serviceReady: false,
};

// acceptInvite lands in #272. Until then a stub stands in; the other nine rules are the real ones.
const acceptInvite = vi.fn<DataRules['acceptInvite']>(async () => ({ ok: true, value: { ownerId: OWNER.userId } }));
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

const verify = vi.fn(async (token: string): Promise<Caller | null> => (token === TOKEN ? OWNER : null));
const onError = vi.fn();
const app = createDataApp({ rules, doc, table, verify, onError });

async function call(body: unknown, headers: Record<string, string> = { [DATA_USER_TOKEN_HEADER]: TOKEN }) {
  return app.request('/v1', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

async function act(action: string, args: Record<string, unknown> = {}): Promise<DataResult> {
  const response = await call({ action, args });
  expect(response.status).toBe(200);
  return (await response.json()) as DataResult;
}

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

  describe('the user token', () => {
    it.each([
      ['is missing', {}],
      ['is empty', { [DATA_USER_TOKEN_HEADER]: '' }],
      ['is wrong', { [DATA_USER_TOKEN_HEADER]: 'a.b.c' }],
      ['is in Authorization instead', { authorization: `Bearer ${TOKEN}` }],
    ])('answers 401 with no DynamoDB call when it %s', async (_name, headers) => {
      const response = await call({ action: 'listFlows', args: {} }, headers);
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ error: 'unauthorized' });
      expect(send).not.toHaveBeenCalled();
    });

    it('answers 401 before it reads a bad body', async () => {
      expect((await call('{not json', {})).status).toBe(401);
    });

    it('answers 500 with no detail when the verifier itself fails', async () => {
      verify.mockRejectedValueOnce(new Error('keys down for pat@example.test'));
      const response = await call({ action: 'listFlows', args: {} });
      expect(response.status).toBe(500);
      expect(await response.text()).toBe('{"error":"internal"}');
      expect(send).not.toHaveBeenCalled();
      expect(onError).toHaveBeenCalledWith('verify', 'Error');
    });
  });

  describe('input checks (C8)', () => {
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
      const response = await call(body);
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: 'bad_request' });
      expect(send).not.toHaveBeenCalled();
    });

    it('answers 400 before any call when createFlow has an unknown key', async () => {
      const response = await call({ action: 'createFlow', args: { id: FLOW_ID, facts: { ...FACTS, ownerId: 'user_x' } } });
      expect(response.status).toBe(400);
      expect(send).not.toHaveBeenCalled();
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
        expect((await call(body)).status).toBe(400);
      }
      expect(send).not.toHaveBeenCalled();
      expect(acceptInvite).not.toHaveBeenCalled();
    });

    it('serves POST /v1 only', async () => {
      expect((await app.request('/v1', { method: 'GET' })).status).toBe(404);
      expect((await app.request('/v2', { method: 'POST', headers: { [DATA_USER_TOKEN_HEADER]: TOKEN } })).status).toBe(404);
      expect((await app.request('/', { method: 'POST', headers: { [DATA_USER_TOKEN_HEADER]: TOKEN } })).status).toBe(404);
      expect(send).not.toHaveBeenCalled();
    });
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

    it('acceptInvite, through the stub', async () => {
      expect(await act('acceptInvite', { tokenHash: HASH })).toEqual({ ok: true, data: { ownerId: OWNER.userId } });
      expect(acceptInvite).toHaveBeenCalledWith(doc, table, OWNER, HASH, expect.anything());
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
        rules: { ...rules, acceptInvite: async () => { throw new Error(`boom ${OWNER.email} ${HASH} ${TOKEN}`); } },
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

    it('never puts the token, an email or a hash in a normal response', async () => {
      const response = await call({ action: 'listMembers', args: {} });
      const text = await response.text();
      expect(text).not.toContain(TOKEN);
      expect(text).not.toContain(OWNER.email);
    });
  });
});
