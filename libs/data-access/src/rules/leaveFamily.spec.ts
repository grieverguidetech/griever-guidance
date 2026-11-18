import { randomUUID } from 'node:crypto';
import { ScanCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { fixedClock } from '../clock.js';
import { emptyDetails, encodeFlow, type FlowItem } from '../items/flowItem.js';
import { encodeMember, encodeMemberOf } from '../items/memberItems.js';
import { encodeProfile, getProfile } from '../items/profileItem.js';
import { memberKey, memberOfKey } from '../keys.js';
import { getLive } from '../read.js';
import { conflictDouble } from '../testing/conflictDouble.js';
import { createTables, doc, dropTables, rawPut, table, up } from '../testing/localTable.js';
import { createFlow, listFlows } from './flows.js';
import { leaveFamily, removeMember } from './members.js';

// Far in the real future, so no ttl can fall due while DynamoDB Local's sweeper runs (see deleteFlow.spec).
const clock = fixedClock('2099-10-24T12:00:00.000Z');
const HOUR = 60 * 60 * 1000;
const at = (offsetMs: number) => new Date(clock.now().getTime() + offsetMs).toISOString();
const uid = (name: string) => `user_${name}_${randomUUID().slice(0, 8)}`;
const caller = (userId: string) => ({ userId, email: `${userId}@example.test`, emailVerified: true });
const NOT_A_MEMBER = { ok: false, code: 'not_found' };
const noSleep = { sleep: async () => undefined };
const FACTS = {
  personName: 'Grandma',
  dateOfPassing: null,
  serviceDate: null,
  obituaryUrl: null,
  obituaryPublisher: null,
  serviceReady: false,
};

const profile = (userId: string, accountType: 'owner' | 'member' = 'owner') =>
  rawPut(encodeProfile({ userId, accountType, version: 1, createdAt: at(-HOUR), updatedAt: at(-HOUR) }));

const flow = (ownerId: string): FlowItem => ({
  id: randomUUID(),
  ownerId,
  facts: FACTS,
  details: emptyDetails(),
  createdAt: at(-HOUR),
  updatedAt: at(-HOUR),
  updatedBy: ownerId,
});

/** An owner with one flow and one member. */
async function seedFamily(owner: string, member: string): Promise<FlowItem> {
  const shared = flow(owner);
  await profile(owner);
  await profile(member, 'member');
  await rawPut(encodeFlow(shared));
  await rawPut(encodeMember({ ownerId: owner, memberId: member, email: `${member}@example.test`, createdAt: at(-HOUR) }));
  await rawPut(encodeMemberOf({ memberId: member, ownerId: owner, createdAt: at(-HOUR) }));
  return shared;
}

/** Every item that mentions one of the ids, in stable order, so before and after compare. Ids are unique per test. */
async function snapshot(...ids: string[]): Promise<string> {
  const items: Array<Record<string, unknown>> = [];
  let start: Record<string, unknown> | undefined;
  do {
    const page = await doc.send(new ScanCommand({ TableName: table, ConsistentRead: true, ExclusiveStartKey: start }));
    items.push(...(page.Items ?? []));
    start = page.LastEvaluatedKey;
  } while (start);
  const mine = items.filter((item) => ids.some((id) => JSON.stringify(item).includes(id)));
  return JSON.stringify(mine.sort((a, b) => `${a['pk']}|${a['sk']}`.localeCompare(`${b['pk']}|${b['sk']}`)));
}

describe.runIf(up)('leaveFamily on DynamoDB Local', () => {
  beforeAll(createTables);
  afterAll(dropTables);

  it('deletes both membership items and makes the member an owner', async () => {
    const owner = uid('owner');
    const member = uid('member');
    await seedFamily(owner, member);
    expect(await leaveFamily(doc, table, caller(member), clock)).toEqual({ ok: true, value: null });
    expect(await getLive(doc, table, memberOfKey(member), clock)).toBeUndefined();
    expect(await getLive(doc, table, memberKey(owner, member), clock)).toBeUndefined();
    expect(await getProfile(doc, table, member, clock)).toMatchObject({ accountType: 'owner', version: 2 });
    expect(await getProfile(doc, table, owner, clock)).toMatchObject({ accountType: 'owner', version: 2 });
  });

  it('shows 0 of the former owner flows afterwards and lets them create their own', async () => {
    const owner = uid('owner');
    const member = uid('member');
    const shared = await seedFamily(owner, member);
    expect((await listFlows(doc, table, caller(member), clock)).map((f) => f.id)).toEqual([shared.id]);
    await leaveFamily(doc, table, caller(member), clock);
    expect(await listFlows(doc, table, caller(member), clock)).toEqual([]);
    const own = await createFlow(doc, table, caller(member), randomUUID(), FACTS, clock);
    expect(own.ok).toBe(true);
    const mine = await listFlows(doc, table, caller(member), clock);
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ role: 'owner' });
  });

  it('leaves the former owner flows and other members unchanged', async () => {
    const owner = uid('owner');
    const leaver = uid('leaver');
    const stayer = uid('stayer');
    const shared = await seedFamily(owner, leaver);
    await profile(stayer, 'member');
    await rawPut(encodeMember({ ownerId: owner, memberId: stayer, email: `${stayer}@example.test`, createdAt: at(-HOUR) }));
    await rawPut(encodeMemberOf({ memberId: stayer, ownerId: owner, createdAt: at(-HOUR) }));
    await leaveFamily(doc, table, caller(leaver), clock);
    expect(await getLive(doc, table, memberKey(owner, stayer), clock)).toMatchObject({ memberId: stayer });
    expect(await getLive(doc, table, memberOfKey(stayer), clock)).toMatchObject({ ownerId: owner });
    expect(await getProfile(doc, table, stayer, clock)).toMatchObject({ accountType: 'member', version: 1 });
    expect((await listFlows(doc, table, caller(stayer), clock)).map((f) => f.id)).toEqual([shared.id]);
    expect((await listFlows(doc, table, caller(owner), clock)).map((f) => f.id)).toEqual([shared.id]);
  });

  it('answers not a member for an owner and writes nothing', async () => {
    const owner = uid('owner');
    const member = uid('member');
    await seedFamily(owner, member);
    const before = await snapshot(owner, member);
    expect(await leaveFamily(doc, table, caller(owner), clock)).toEqual(NOT_A_MEMBER);
    expect(await snapshot(owner, member)).toBe(before);
  });

  it('answers the same for a stranger with no profile and writes nothing', async () => {
    const stranger = uid('stranger');
    expect(await leaveFamily(doc, table, caller(stranger), clock)).toEqual(NOT_A_MEMBER);
    expect(await snapshot(stranger)).toBe('[]');
  });

  it('runs again when the profile changed after the read, and still ends as owner', async () => {
    const owner = uid('owner');
    const member = uid('member');
    await seedFamily(owner, member);
    const attempts: number[] = [];
    const result = await leaveFamily(doc, table, caller(member), clock, {
      ...noSleep,
      beforeCommit: async (attempt) => {
        attempts.push(attempt);
        if (attempt === 1) {
          await rawPut(encodeProfile({ userId: member, accountType: 'member', version: 2, createdAt: at(-HOUR), updatedAt: at(-HOUR) }));
        }
      },
    });
    expect(result).toEqual({ ok: true, value: null });
    expect(attempts).toEqual([1, 2]);
    expect(await getProfile(doc, table, member, clock)).toMatchObject({ accountType: 'owner', version: 3 });
  });

  it('answers not a member when the owner removes them before the commit', async () => {
    const owner = uid('owner');
    const member = uid('member');
    await seedFamily(owner, member);
    const result = await leaveFamily(doc, table, caller(member), clock, {
      ...noSleep,
      beforeCommit: async (attempt) => {
        if (attempt === 1) {
          expect(await removeMember(doc, table, caller(owner), member, clock)).toEqual({ ok: true, value: null });
        }
      },
    });
    expect(result).toEqual(NOT_A_MEMBER);
    expect(await getLive(doc, table, memberOfKey(member), clock)).toBeUndefined();
    expect(await getLive(doc, table, memberKey(owner, member), clock)).toBeUndefined();
    expect(await getProfile(doc, table, member, clock)).toMatchObject({ accountType: 'owner', version: 2 });
  });

  it('creates an owner profile when the member has none', async () => {
    const owner = uid('owner');
    const member = uid('member');
    await profile(owner);
    await rawPut(encodeMember({ ownerId: owner, memberId: member, email: `${member}@example.test`, createdAt: at(-HOUR) }));
    await rawPut(encodeMemberOf({ memberId: member, ownerId: owner, createdAt: at(-HOUR) }));
    expect(await leaveFamily(doc, table, caller(member), clock)).toEqual({ ok: true, value: null });
    expect(await getProfile(doc, table, member, clock)).toMatchObject({ accountType: 'owner', version: 1 });
    expect(await getLive(doc, table, memberOfKey(member), clock)).toBeUndefined();
    expect(await getLive(doc, table, memberKey(owner, member), clock)).toBeUndefined();
  });

  it('answers busy after three transaction conflicts and writes nothing', async () => {
    const owner = uid('owner');
    const member = uid('member');
    await seedFamily(owner, member);
    const before = await snapshot(owner, member);
    const double = conflictDouble(doc, 3);
    // Only writes go through the double; reads reach the table.
    const client = {
      send: (command: unknown) => (command instanceof TransactWriteCommand ? double.send(command) : doc.send(command as never)),
    };
    expect(await leaveFamily(client as never, table, caller(member), clock, noSleep)).toEqual({ ok: false, code: 'busy' });
    expect(double.attempts).toBe(3);
    expect(await snapshot(owner, member)).toBe(before);
  });

  it('succeeds on the retry after one conflict, so the call can be repeated', async () => {
    const owner = uid('owner');
    const member = uid('member');
    await seedFamily(owner, member);
    const double = conflictDouble(doc, 1);
    const client = {
      send: (command: unknown) => (command instanceof TransactWriteCommand ? double.send(command) : doc.send(command as never)),
    };
    expect(await leaveFamily(client as never, table, caller(member), clock, noSleep)).toEqual({ ok: true, value: null });
    expect(await getProfile(doc, table, member, clock)).toMatchObject({ accountType: 'owner', version: 2 });
  });
});
