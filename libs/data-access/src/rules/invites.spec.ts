import { randomUUID } from 'node:crypto';
import { UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { fixedClock } from '../clock.js';
import { decodeInvite, encodeInvite, type InviteItem } from '../items/inviteItems.js';
import { encodeMember, encodeMemberOf } from '../items/memberItems.js';
import { encodeProfile, getProfile } from '../items/profileItem.js';
import { INVITE_PREFIX, inviteKey, tokenKey } from '../keys.js';
import { getLive, queryLive } from '../read.js';
import { createTables, doc, dropTables, rawPut, table, up } from '../testing/localTable.js';
import { createInvite, revokeInvite } from './invites.js';

const clock = fixedClock('2026-10-24T12:00:00.000Z');
const HOUR = 60 * 60 * 1000;
const at = (offsetMs: number) => new Date(clock.now().getTime() + offsetMs).toISOString();

let counter = 0;
const hash = () => (randomUUID() + randomUUID()).replaceAll('-', '').slice(0, 64);
const caller = (userId: string, overrides: { email?: string; emailVerified?: boolean } = {}) => ({
  userId,
  email: `${userId}@example.test`,
  emailVerified: true,
  ...overrides,
});
const newOwner = async (version = 1, accountType: 'owner' | 'member' = 'owner') => {
  counter += 1;
  const userId = `user_i_${counter}`;
  const at0 = '2026-10-01T00:00:00.000Z';
  await rawPut(encodeProfile({ userId, accountType, version, createdAt: at0, updatedAt: at0 }));
  return userId;
};
const seedInvite = async (ownerId: string, overrides: Partial<InviteItem> = {}): Promise<InviteItem> => {
  const invite: InviteItem = {
    id: randomUUID(),
    ownerId,
    email: `seed-${randomUUID().slice(0, 8)}@example.test`,
    tokenHash: hash(),
    createdAt: at(-48 * HOUR),
    expiresAt: at(24 * HOUR),
    ...overrides,
  };
  await rawPut(encodeInvite(invite));
  return invite;
};
const stored = async (ownerId: string) =>
  (await queryLive(doc, table, ownerId, clock, INVITE_PREFIX)).map(decodeInvite);

describe.runIf(up)('createInvite on DynamoDB Local', () => {
  beforeAll(createTables);
  afterAll(dropTables);

  it('creates an invite, lower-cases the email, and bumps the owner version', async () => {
    const owner = await newOwner(4);
    const hashValue = hash();
    const result = await createInvite(doc, table, caller(owner), '  Sam@Example.TEST ', hashValue, clock);
    expect(result).toEqual({
      ok: true,
      value: {
        id: expect.any(String),
        email: 'sam@example.test',
        createdAt: clock.now().toISOString(),
        expiresAt: at(7 * 24 * HOUR),
      },
    });
    expect((await getProfile(doc, table, owner, clock))?.version).toBe(5);
    expect(await getLive(doc, table, tokenKey(hashValue), clock)).toMatchObject({ ownerId: owner });
  });

  it('never returns the token hash', async () => {
    const owner = await newOwner();
    const hashValue = hash();
    const result = await createInvite(doc, table, caller(owner), 'a@example.test', hashValue, clock);
    expect(JSON.stringify(result)).not.toContain(hashValue);
    expect(JSON.stringify(result)).not.toContain('tokenHash');
  });

  it('creates the owner profile when there is none', async () => {
    const result = await createInvite(doc, table, caller('user_i_fresh'), 'a@example.test', hash(), clock);
    expect(result.ok).toBe(true);
    expect(await getProfile(doc, table, 'user_i_fresh', clock)).toMatchObject({ accountType: 'owner', version: 1 });
  });

  it('refuses a bad email or a bad hash as invalid', async () => {
    const owner = await newOwner();
    for (const [email, hashValue] of [
      ['not-an-email', hash()],
      ['a@b', hash()],
      ['a@example.test', 'short'],
      ['a@example.test', 'A'.repeat(64)],
    ] as const) {
      expect(await createInvite(doc, table, caller(owner), email, hashValue, clock)).toEqual({ ok: false, code: 'invalid' });
    }
    expect(await stored(owner)).toEqual([]);
  });

  it("refuses the caller's own email, in any case, as invalid", async () => {
    const owner = await newOwner();
    const me = caller(owner, { email: 'Me@Example.test' });
    expect(await createInvite(doc, table, me, ' me@example.TEST', hash(), clock)).toEqual({ ok: false, code: 'invalid' });
  });

  it('refuses a caller who is a member by accountType', async () => {
    const owner = await newOwner(1, 'member');
    expect(await createInvite(doc, table, caller(owner), 'a@example.test', hash(), clock)).toEqual({ ok: false, code: 'forbidden' });
  });

  it('refuses a caller who has a MEMBER_OF item', async () => {
    const owner = await newOwner();
    await rawPut(encodeMemberOf({ memberId: owner, ownerId: 'user_someone', createdAt: at(-HOUR) }));
    expect(await createInvite(doc, table, caller(owner), 'a@example.test', hash(), clock)).toEqual({ ok: false, code: 'forbidden' });
    expect(await stored(owner)).toEqual([]);
  });

  it('refuses a caller whose email is not verified', async () => {
    const owner = await newOwner();
    const result = await createInvite(doc, table, caller(owner, { emailVerified: false }), 'a@example.test', hash(), clock);
    expect(result).toEqual({ ok: false, code: 'forbidden' });
  });

  it("refuses an existing member's email as already_member", async () => {
    const owner = await newOwner();
    await rawPut(encodeMember({ ownerId: owner, memberId: 'user_i_helper', email: 'helper@example.test', createdAt: at(-HOUR) }));
    const result = await createInvite(doc, table, caller(owner), 'Helper@example.test', hash(), clock);
    expect(result).toEqual({ ok: false, code: 'already_member' });
  });

  it('refuses a second open invite to the same email as already_invited', async () => {
    const owner = await newOwner();
    await seedInvite(owner, { email: 'dup@example.test' });
    const result = await createInvite(doc, table, caller(owner), 'DUP@example.test', hash(), clock);
    expect(result).toEqual({ ok: false, code: 'already_invited' });
  });

  it('refuses a reused hash as already_invited, with no key detail', async () => {
    const owner = await newOwner();
    const other = await newOwner();
    const used = hash();
    expect((await createInvite(doc, table, caller(other), 'one@example.test', used, clock)).ok).toBe(true);
    const result = await createInvite(doc, table, caller(owner), 'two@example.test', used, clock);
    expect(result).toEqual({ ok: false, code: 'already_invited' });
    expect(await stored(owner)).toEqual([]);
    expect((await getProfile(doc, table, owner, clock))?.version).toBe(1);
  });

  it('refuses the 11th invite in 24 hours as rate_limited, counting revoked ones', async () => {
    const owner = await newOwner();
    for (let i = 0; i < 9; i += 1) {
      await seedInvite(owner, { createdAt: at(-i * HOUR) });
    }
    await seedInvite(owner, { createdAt: at(-2 * HOUR), revokedAt: at(-HOUR) });
    const result = await createInvite(doc, table, caller(owner), 'late@example.test', hash(), clock);
    expect(result).toEqual({ ok: false, code: 'rate_limited' });
    expect(await stored(owner)).toHaveLength(10);
  });

  it('does not count invites older than 24 hours', async () => {
    const owner = await newOwner();
    for (let i = 0; i < 10; i += 1) {
      await seedInvite(owner, { createdAt: at(-25 * HOUR), revokedAt: at(-24 * HOUR) });
    }
    expect((await createInvite(doc, table, caller(owner), 'ok@example.test', hash(), clock)).ok).toBe(true);
  });

  it('refuses a 21st open invite as rate_limited', async () => {
    const owner = await newOwner();
    for (let i = 0; i < 20; i += 1) {
      await seedInvite(owner);
    }
    const result = await createInvite(doc, table, caller(owner), 'extra@example.test', hash(), clock);
    expect(result).toEqual({ ok: false, code: 'rate_limited' });
  });

  it('retires an expired open invite to the same email in the same transaction', async () => {
    const owner = await newOwner();
    const old = await seedInvite(owner, { email: 'again@example.test', createdAt: at(-9 * 24 * HOUR), expiresAt: at(-2 * 24 * HOUR) });
    const result = await createInvite(doc, table, caller(owner), 'again@example.test', hash(), clock);
    expect(result.ok).toBe(true);
    const items = await stored(owner);
    expect(items).toHaveLength(2);
    expect(items.find((i) => i.id === old.id)?.revokedAt).toBe(clock.now().toISOString());
  });

  it('keeps the old invite when the new one is refused', async () => {
    const owner = await newOwner();
    const old = await seedInvite(owner, { email: 'again@example.test', createdAt: at(-9 * 24 * HOUR), expiresAt: at(-2 * 24 * HOUR) });
    const taken = hash();
    await rawPut({ ...tokenKey(taken), entity: 'TOKEN', ownerId: 'user_x', inviteId: randomUUID() });
    const result = await createInvite(doc, table, caller(owner), 'again@example.test', taken, clock);
    expect(result).toEqual({ ok: false, code: 'already_invited' });
    const raw = await getLive(doc, table, inviteKey(owner, old.id), clock);
    expect(raw?.['revokedAt']).toBeUndefined();
  });

  it('refuses when the caller becomes a member between the read and the commit', async () => {
    const owner = await newOwner();
    const result = await createInvite(doc, table, caller(owner), 'a@example.test', hash(), clock, {
      beforeCommit: async (attempt) => {
        if (attempt === 1) {
          await rawPut(encodeMemberOf({ memberId: owner, ownerId: 'user_someone', createdAt: at(-HOUR) }));
        }
      },
      sleep: async () => undefined,
    });
    expect(result).toEqual({ ok: false, code: 'forbidden' });
    expect(await stored(owner)).toEqual([]);
  });

  it('keeps an external revoke of the expired invite and still creates the new one', async () => {
    const owner = await newOwner();
    const old = await seedInvite(owner, { email: 'again@example.test', createdAt: at(-9 * 24 * HOUR), expiresAt: at(-2 * 24 * HOUR) });
    const external = at(-HOUR);
    const result = await createInvite(doc, table, caller(owner), 'again@example.test', hash(), clock, {
      beforeCommit: async (attempt) => {
        if (attempt === 1) {
          await doc.send(
            new UpdateCommand({
              TableName: table,
              Key: inviteKey(owner, old.id),
              UpdateExpression: 'SET revokedAt = :at',
              ExpressionAttributeValues: { ':at': external },
            }),
          );
        }
      },
      sleep: async () => undefined,
    });
    expect(result.ok).toBe(true);
    const items = await stored(owner);
    expect(items).toHaveLength(2);
    expect(items.find((i) => i.id === old.id)?.revokedAt).toBe(external);
  });

  it('lets only one of two interleaved invites to the same email through (race)', async () => {
    const owner = await newOwner();
    let second: Awaited<ReturnType<typeof createInvite>> | undefined;
    const first = await createInvite(doc, table, caller(owner), 'same@example.test', hash(), clock, {
      beforeCommit: async (attempt) => {
        if (attempt === 1) {
          second = await createInvite(doc, table, caller(owner), 'Same@example.test', hash(), clock);
        }
      },
      sleep: async () => undefined,
    });
    expect(second?.ok).toBe(true);
    expect(first).toEqual({ ok: false, code: 'already_invited' });
    expect((await stored(owner)).filter((i) => i.email === 'same@example.test')).toHaveLength(1);
  });

  it('cannot pass the 10 per 24 hour limit twice at once (race)', async () => {
    const owner = await newOwner();
    for (let i = 0; i < 9; i += 1) {
      await seedInvite(owner, { createdAt: at(-i * HOUR) });
    }
    let second: Awaited<ReturnType<typeof createInvite>> | undefined;
    const first = await createInvite(doc, table, caller(owner), 'first@example.test', hash(), clock, {
      // Between the first call's reads and its commit, the second call runs to the end.
      beforeCommit: async (attempt) => {
        if (attempt === 1) {
          second = await createInvite(doc, table, caller(owner), 'second@example.test', hash(), clock);
        }
      },
      sleep: async () => undefined,
    });
    expect(second?.ok).toBe(true);
    expect(first).toEqual({ ok: false, code: 'rate_limited' });
    expect(await stored(owner)).toHaveLength(10);
  });
});

describe.runIf(up)('revokeInvite on DynamoDB Local', () => {
  beforeAll(createTables);
  afterAll(dropTables);

  it('revokes the caller\'s own open invite', async () => {
    const owner = await newOwner();
    const invite = await seedInvite(owner);
    expect(await revokeInvite(doc, table, caller(owner), invite.id, clock)).toEqual({ ok: true, value: null });
    expect((await stored(owner))[0]?.revokedAt).toBe(clock.now().toISOString());
    expect((await getProfile(doc, table, owner, clock))?.version).toBe(2);
  });

  it('does not bump the owner version when the revoke is refused', async () => {
    const owner = await newOwner();
    expect(await revokeInvite(doc, table, caller(owner), randomUUID(), clock)).toEqual({ ok: false, code: 'not_found' });
    expect((await getProfile(doc, table, owner, clock))?.version).toBe(1);
  });

  it('answers not_found for another owner, an unknown id, a bad id, a revoked and an accepted invite', async () => {
    const owner = await newOwner();
    const other = await newOwner();
    const theirs = await seedInvite(other);
    const revoked = await seedInvite(owner, { revokedAt: at(-HOUR) });
    const accepted = await seedInvite(owner, { acceptedAt: at(-HOUR), acceptedBy: 'user_m' });
    for (const id of [theirs.id, randomUUID(), 'nope', revoked.id, accepted.id]) {
      expect(await revokeInvite(doc, table, caller(owner), id, clock)).toEqual({ ok: false, code: 'not_found' });
    }
    expect((await stored(other))[0]?.revokedAt).toBeUndefined();
    expect((await stored(owner)).find((i) => i.id === accepted.id)?.revokedAt).toBeUndefined();
  });

  it('answers not_found when the invite is revoked between the read and the commit', async () => {
    const owner = await newOwner();
    const invite = await seedInvite(owner);
    const result = await revokeInvite(doc, table, caller(owner), invite.id, clock, {
      beforeCommit: async () => {
        await revokeInvite(doc, table, caller(owner), invite.id, clock);
      },
    });
    expect(result).toEqual({ ok: false, code: 'not_found' });
  });
});
