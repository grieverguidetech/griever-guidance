import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { DATA_ACTIONS } from '@griever/shared';
import { fixedClock } from '../clock.js';
import { HANDLED_ACTIONS, prepareAction, type ActionContext, type DataRules } from './actions.js';

const ID = '11111111-1111-4111-8111-111111111111';
const HASH = 'a'.repeat(64);
const FACTS = {
  personName: 'Grandma',
  dateOfPassing: null,
  serviceDate: null,
  obituaryUrl: null,
  obituaryPublisher: null,
  serviceReady: false,
};
const caller = { userId: 'user_a', email: 'a@example.test', emailVerified: true };

function stubRules() {
  const ok = { ok: true, value: 'v' };
  return {
    getProfile: vi.fn(async () => null),
    putProfile: vi.fn(async () => ok),
    listFlows: vi.fn(async () => []),
    createFlow: vi.fn(async () => ok),
    updateFlow: vi.fn(async () => ok),
    createInvite: vi.fn(async () => ok),
    revokeInvite: vi.fn(async () => ok),
    listMembers: vi.fn(async () => ({ role: 'owner' })),
    removeMember: vi.fn(async () => ok),
    acceptInvite: vi.fn(async () => ok),
  };
}

const context = (rules: ReturnType<typeof stubRules>): ActionContext => ({
  rules: rules as unknown as DataRules,
  doc: {} as DynamoDBDocumentClient,
  table: 'gg-test',
  clock: fixedClock('2026-10-24T12:00:00.000Z'),
  caller,
});

/** One good args object per action. */
const GOOD: Record<(typeof DATA_ACTIONS)[number], Record<string, unknown>> = {
  getProfile: {},
  putProfile: { fields: { senderName: 'Pat' } },
  listFlows: {},
  createFlow: { id: ID, facts: FACTS },
  updateFlow: { id: ID, patch: { personName: 'Nana' } },
  createInvite: { email: 'Helper@Example.test', tokenHash: HASH },
  revokeInvite: { id: ID },
  listMembers: {},
  removeMember: { memberId: 'user_b' },
  acceptInvite: { tokenHash: HASH },
};

describe('action table', () => {
  it('covers exactly DATA_ACTIONS: adding or removing one means changing both', () => {
    expect([...HANDLED_ACTIONS].sort()).toEqual([...DATA_ACTIONS].sort());
  });

  it.each(['deleteUserData', 'constructor', '__proto__', 'toString', '', 'GETPROFILE'])(
    'does not serve the action "%s"',
    (name) => {
      expect(prepareAction(name, {})).toBeNull();
    },
  );

  it.each(DATA_ACTIONS)('%s: accepts good args, and refuses an extra key', (action) => {
    expect(prepareAction(action, GOOD[action]!)).not.toBeNull();
    expect(prepareAction(action, { ...GOOD[action], extra: 1 })).toBeNull();
  });

  it.each(DATA_ACTIONS.filter((action) => Object.keys(GOOD[action]!).length > 0))(
    '%s: refuses empty args',
    (action) => {
      expect(prepareAction(action, {})).toBeNull();
    },
  );
});

describe('args validation (C8)', () => {
  it.each([
    ['putProfile fields is a string', 'putProfile', { fields: 'x' }],
    ['putProfile fields is an array', 'putProfile', { fields: [] }],
    ['putProfile fields is null', 'putProfile', { fields: null }],
    ['createFlow id is not a uuid', 'createFlow', { id: 'nope', facts: FACTS }],
    ['createFlow id is a number', 'createFlow', { id: 1, facts: FACTS }],
    ['createFlow facts has an unknown key', 'createFlow', { id: ID, facts: { ...FACTS, draft: 'x' } }],
    ['createFlow facts lacks a key', 'createFlow', { id: ID, facts: { personName: 'Grandma' } }],
    ['createFlow facts is a string', 'createFlow', { id: ID, facts: 'x' }],
    ['updateFlow id is not a uuid', 'updateFlow', { id: 'nope', patch: {} }],
    ['updateFlow patch has an unknown key', 'updateFlow', { id: ID, patch: { ownerId: 'x' } }],
    ['updateFlow patch value is the wrong type', 'updateFlow', { id: ID, patch: { serviceReady: 'yes' } }],
    ['createInvite email is not an address', 'createInvite', { email: 'nope', tokenHash: HASH }],
    ['createInvite email is a number', 'createInvite', { email: 5, tokenHash: HASH }],
    ['createInvite hash is too short', 'createInvite', { email: 'a@example.test', tokenHash: 'a'.repeat(63) }],
    ['createInvite hash is upper case', 'createInvite', { email: 'a@example.test', tokenHash: 'A'.repeat(64) }],
    ['revokeInvite id is not a uuid', 'revokeInvite', { id: 'nope' }],
    ['removeMember id has a #', 'removeMember', { memberId: 'user#b' }],
    ['removeMember id is empty', 'removeMember', { memberId: '' }],
    ['removeMember id is too long', 'removeMember', { memberId: 'u'.repeat(65) }],
    ['acceptInvite hash is not hex', 'acceptInvite', { tokenHash: 'z'.repeat(64) }],
    ['acceptInvite hash is a number', 'acceptInvite', { tokenHash: 1 }],
  ] as const)('refuses: %s', (_name, action, args) => {
    expect(prepareAction(action, args)).toBeNull();
  });
});

describe('running an action', () => {
  it('passes the caller, table and clock, and the validated args, to the rule', async () => {
    const rules = stubRules();
    const c = context(rules);
    await prepareAction('createFlow', GOOD['createFlow']!)!(c);
    expect(rules.createFlow).toHaveBeenCalledWith(c.doc, 'gg-test', caller, ID, FACTS, c.clock);
    await prepareAction('createInvite', GOOD['createInvite']!)!(c);
    // The rule normalises the address itself, so the handler passes it on as sent.
    expect(rules.createInvite).toHaveBeenCalledWith(c.doc, 'gg-test', caller, 'Helper@Example.test', HASH, c.clock);
    await prepareAction('acceptInvite', GOOD['acceptInvite']!)!(c);
    expect(rules.acceptInvite).toHaveBeenCalledWith(c.doc, 'gg-test', caller, HASH, c.clock);
  });

  it('wraps a success as { ok, data }, and a read with no rows as null data', async () => {
    const rules = stubRules();
    expect(await prepareAction('updateFlow', GOOD['updateFlow']!)!(context(rules))).toEqual({ ok: true, data: 'v' });
    expect(await prepareAction('getProfile', {})!(context(rules))).toEqual({ ok: true, data: null });
  });

  it('keeps only the code on a refusal', async () => {
    const rules = stubRules();
    rules.removeMember.mockResolvedValueOnce({ ok: false, code: 'forbidden', secret: 'x' } as never);
    expect(await prepareAction('removeMember', GOOD['removeMember']!)!(context(rules))).toEqual({
      ok: false,
      code: 'forbidden',
    });
  });

  it('gives busy a calm message', async () => {
    const rules = stubRules();
    rules.revokeInvite.mockResolvedValueOnce({ ok: false, code: 'busy' } as never);
    const result = await prepareAction('revokeInvite', GOOD['revokeInvite']!)!(context(rules));
    expect(result).toMatchObject({ ok: false, code: 'busy' });
    expect(result).toHaveProperty('message', expect.stringContaining('try again'));
  });
});
