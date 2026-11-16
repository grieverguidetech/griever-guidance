import { createHash, randomUUID } from 'node:crypto';
import { ScanCommand } from '@aws-sdk/lib-dynamodb';
import { fixedClock } from '../clock.js';
import { emptyDetails, encodeFlow, type FlowItem } from '../items/flowItem.js';
import { encodeInvite, encodeToken } from '../items/inviteItems.js';
import { encodeProfile } from '../items/profileItem.js';
import { flowGuardKey, flowKey, memberOfKey } from '../keys.js';
import { getLive } from '../read.js';
import { createTables, doc, dropTables, rawPut, table, up } from '../testing/localTable.js';
import { acceptInvite } from './acceptInvite.js';
import { deleteUser } from './deleteUser.js';
import { createFlow, deleteFlow, listFlows, updateFlow } from './flows.js';

const clock = fixedClock('2026-10-24T12:00:00.000Z');
const NOW_SECONDS = Math.floor(clock.now().getTime() / 1000);
const NINETY_DAYS = 90 * 24 * 60 * 60;
const HOUR = 60 * 60 * 1000;
const at = (offsetMs: number) => new Date(clock.now().getTime() + offsetMs).toISOString();
const uid = (name: string) => `user_${name}_${randomUUID().slice(0, 8)}`;
const caller = (userId: string) => ({ userId, email: `${userId}@example.test`, emailVerified: true });
const NOT_FOUND = { ok: false, code: 'not_found' };

const FACTS = {
  personName: 'Grandma',
  dateOfPassing: null,
  serviceDate: null,
  obituaryUrl: null,
  obituaryPublisher: null,
  serviceReady: false,
};

const flowItem = (ownerId: string, id: string): FlowItem => ({
  id,
  ownerId,
  facts: FACTS,
  details: emptyDetails(),
  createdAt: at(-HOUR),
  updatedAt: at(-HOUR),
  updatedBy: ownerId,
});

const profile = (userId: string, accountType: 'owner' | 'member' = 'owner') =>
  rawPut(encodeProfile({ userId, accountType, version: 1, createdAt: at(-HOUR), updatedAt: at(-HOUR) }));

/**
 * The items as stored that mention any of the given ids (user or person ids), in stable order, so
 * before and after can be compared. The table is shared with other specs and tests, so a snapshot
 * of the whole table would change when they write; ids are unique per test.
 */
async function rawSnapshot(...ids: string[]): Promise<string> {
  const items: Array<Record<string, unknown>> = [];
  let start: Record<string, unknown> | undefined;
  do {
    const page = await doc.send(new ScanCommand({ TableName: table, ConsistentRead: true, ExclusiveStartKey: start }));
    items.push(...(page.Items ?? []));
    start = page.LastEvaluatedKey;
  } while (start);
  const keyOf = (item: Record<string, unknown>) => `${String(item['pk'])}|${String(item['sk'])}`;
  const mine = items.filter((item) => {
    const text = JSON.stringify(item);
    return ids.some((id) => text.includes(id));
  });
  return JSON.stringify(mine.sort((a, b) => keyOf(a).localeCompare(keyOf(b))));
}

/** An owner with a profile and one person, plus the id guard createFlow would have written. */
async function seedOwnerWithPerson(extra: Record<string, unknown> = {}) {
  const owner = uid('owner');
  const id = randomUUID();
  await profile(owner);
  await rawPut({ ...encodeFlow(flowItem(owner, id)), ...extra });
  await rawPut({ ...flowGuardKey(id), entity: 'FLOW_GUARD', ownerId: owner });
  return { owner, id };
}

async function seedMemberOf(owner: string) {
  const member = uid('member');
  await profile(member, 'member');
  await rawPut({ ...memberOfKey(member), entity: 'MEMBER_OF', ownerId: owner });
  return member;
}

describe.runIf(up)('deleteFlow on DynamoDB Local', () => {
  beforeAll(createTables);
  afterAll(dropTables);

  it('lets the owner delete: deletedAt and ttl are stored on the flow, the same ttl on the guard', async () => {
    const { owner, id } = await seedOwnerWithPerson();
    expect(await deleteFlow(doc, table, caller(owner), id, clock)).toEqual({ ok: true, value: null });
    const flow = await getLive(doc, table, flowKey(owner, id), clock);
    const guard = await getLive(doc, table, flowGuardKey(id), clock);
    expect(flow).toMatchObject({ deletedAt: clock.now().toISOString(), ttl: NOW_SECONDS + NINETY_DAYS });
    expect(guard).toMatchObject({ ownerId: owner, ttl: NOW_SECONDS + NINETY_DAYS });
  });

  describe('refusals are identical and change nothing', () => {
    const modes: Record<string, () => Promise<{ who: string; id: string }>> = {
      'a member of the owner': async () => {
        const { owner, id } = await seedOwnerWithPerson();
        return { who: await seedMemberOf(owner), id };
      },
      'a stranger': async () => {
        const { id } = await seedOwnerWithPerson();
        return { who: uid('stranger'), id };
      },
      'an unknown id': async () => ({ who: uid('owner'), id: randomUUID() }),
      'an already-deleted person': async () => {
        const { owner, id } = await seedOwnerWithPerson({
          deletedAt: at(-HOUR),
          ttl: NOW_SECONDS + NINETY_DAYS,
        });
        return { who: owner, id };
      },
      'an expired person': async () => {
        const { owner, id } = await seedOwnerWithPerson({ ttl: NOW_SECONDS - 10 });
        return { who: owner, id };
      },
      'a deleted and expired person': async () => {
        const { owner, id } = await seedOwnerWithPerson({ deletedAt: at(-HOUR), ttl: NOW_SECONDS - 10 });
        return { who: owner, id };
      },
      'an owner whose id guard belongs to someone else': async () => {
        const { owner, id } = await seedOwnerWithPerson();
        await rawPut({ ...flowGuardKey(id), entity: 'FLOW_GUARD', ownerId: uid('other') });
        return { who: owner, id };
      },
      'an owner whose id guard is missing': async () => {
        const owner = uid('owner');
        const id = randomUUID();
        await profile(owner);
        await rawPut(encodeFlow(flowItem(owner, id)));
        return { who: owner, id };
      },
    };

    it.each(Object.keys(modes))('%s gets not_found', async (mode) => {
      const { who, id } = await modes[mode]!();
      const before = await rawSnapshot(who, id);
      expect(await deleteFlow(doc, table, caller(who), id, clock)).toEqual(NOT_FOUND);
      expect(await rawSnapshot(who, id)).toBe(before);
    });
  });

  it('answers invalid for an id that is not a uuid, and changes nothing', async () => {
    const who = uid('owner');
    await profile(who);
    const before = await rawSnapshot(who, 'nope');
    expect(await deleteFlow(doc, table, caller(who), 'nope', clock)).toEqual({ ok: false, code: 'invalid' });
    expect(await rawSnapshot(who, 'nope')).toBe(before);
  });

  describe('after a delete', () => {
    it('hides the person from the owner, a member and a stranger', async () => {
      const { owner, id } = await seedOwnerWithPerson();
      const member = await seedMemberOf(owner);
      const stranger = uid('stranger');
      expect((await listFlows(doc, table, caller(owner), clock)).filter((r) => r.id === id)).toHaveLength(1);
      expect((await listFlows(doc, table, caller(member), clock)).filter((r) => r.id === id)).toHaveLength(1);

      expect(await deleteFlow(doc, table, caller(owner), id, clock)).toEqual({ ok: true, value: null });

      for (const who of [owner, member, stranger]) {
        expect((await listFlows(doc, table, caller(who), clock)).filter((r) => r.id === id)).toHaveLength(0);
      }
    });

    it('keeps the owner other people in the list', async () => {
      const { owner, id } = await seedOwnerWithPerson();
      const keep = randomUUID();
      await rawPut(encodeFlow(flowItem(owner, keep)));
      await deleteFlow(doc, table, caller(owner), id, clock);
      expect((await listFlows(doc, table, caller(owner), clock)).map((r) => r.id)).toEqual([keep]);
    });

    it('gives updateFlow not_found to the owner and to a member', async () => {
      const { owner, id } = await seedOwnerWithPerson();
      const member = await seedMemberOf(owner);
      await deleteFlow(doc, table, caller(owner), id, clock);
      for (const who of [owner, member]) {
        expect(await updateFlow(doc, table, caller(who), id, { serviceReady: true }, clock)).toEqual(NOT_FOUND);
      }
    });

    it('gives createFlow with the same id a conflict', async () => {
      const { owner, id } = await seedOwnerWithPerson();
      await deleteFlow(doc, table, caller(owner), id, clock);
      expect(await createFlow(doc, table, caller(owner), id, FACTS, clock)).toEqual({ ok: false, code: 'conflict' });
      expect(await createFlow(doc, table, caller(uid('other')), id, FACTS, clock)).toEqual({
        ok: false,
        code: 'conflict',
      });
    });

    it('still refuses a joiner who owns only that person (C11)', async () => {
      const owner = uid('inviter');
      const { owner: joiner, id } = await seedOwnerWithPerson();
      await profile(owner);
      await deleteFlow(doc, table, caller(joiner), id, clock);

      const tokenHash = createHash('sha256').update(randomUUID()).digest('hex');
      const invite = {
        id: randomUUID(),
        ownerId: owner,
        email: caller(joiner).email,
        tokenHash,
        createdAt: at(-HOUR),
        expiresAt: at(24 * HOUR),
      };
      await rawPut(encodeInvite(invite));
      await rawPut(encodeToken(tokenHash, owner, invite.id));
      const scope = [owner, joiner, id, invite.id, tokenHash];
      const before = await rawSnapshot(...scope);

      expect(await acceptInvite(doc, table, caller(joiner), tokenHash, clock)).toEqual({
        ok: false,
        code: 'invite_conflict',
      });
      expect(await rawSnapshot(...scope)).toBe(before);
    });

    it('lets deleteUser still remove the item and its guard', async () => {
      const { owner, id } = await seedOwnerWithPerson();
      await deleteFlow(doc, table, caller(owner), id, clock);
      await deleteUser(doc, table, owner, clock);
      const snapshot = await rawSnapshot(owner, id);
      expect(snapshot).not.toContain(owner);
      expect(snapshot).not.toContain(id);
    });

    it('reads nothing once the clock is past the ttl', async () => {
      const { owner, id } = await seedOwnerWithPerson();
      await deleteFlow(doc, table, caller(owner), id, clock);
      const later = fixedClock(new Date((NOW_SECONDS + NINETY_DAYS + 1) * 1000));
      expect(await getLive(doc, table, flowKey(owner, id), later)).toBeUndefined();
      expect(await getLive(doc, table, flowGuardKey(id), later)).toBeUndefined();
      expect(await listFlows(doc, table, caller(owner), later)).toEqual([]);
    });
  });
});
