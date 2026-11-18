import { createHash, randomUUID } from 'node:crypto';
import { DeleteCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { fixedClock } from '../clock.js';
import { encodeInvite, encodeToken, type InviteItem } from '../items/inviteItems.js';
import { encodeProfile } from '../items/profileItem.js';
import { inviteKey, memberKey, memberOfKey, profileKey, tokenKey, type Key } from '../keys.js';
import { createTables, doc, dropTables, rawPut, table, up } from '../testing/localTable.js';
import { acceptInvite } from './acceptInvite.js';
import { deleteUser } from './deleteUser.js';
import { createInvite, revokeInvite } from './invites.js';
import { listMembers } from './members.js';

// Far in the real future on purpose: every ttl here is clock + 30 days or less, and must stay in the
// real future so DynamoDB Local's TTL sweeper never deletes an item mid-test (SELF_IMPROVEMENT, #869).
// Nothing here waits for DynamoDB to delete anything: tests read the stored attribute, or read with a clock.
const clock = fixedClock('2099-10-24T12:00:00.000Z');
const NOW_SECONDS = Math.floor(clock.now().getTime() / 1000);
const DAY = 24 * 60 * 60;
const THIRTY_DAYS = 30 * DAY;
const HOUR_MS = 60 * 60 * 1000;
const at = (offsetMs: number) => new Date(clock.now().getTime() + offsetMs).toISOString();
const seconds = (iso: string) => Math.floor(Date.parse(iso) / 1000);
const hash = () => createHash('sha256').update(randomUUID()).digest('hex');
const uid = (name: string) => `user_${name}_${randomUUID().slice(0, 8)}`;
const caller = (userId: string) => ({ userId, email: `${userId}@example.test`, emailVerified: true });

const profile = (userId: string) =>
  rawPut(encodeProfile({ userId, accountType: 'owner', version: 1, createdAt: at(-99 * HOUR_MS), updatedAt: at(-99 * HOUR_MS) }));

/** The item exactly as stored, with no ttl filter, so a test can read a ttl that has passed. */
async function raw(key: Key): Promise<Record<string, unknown> | undefined> {
  const { Item } = await doc.send(new GetCommand({ TableName: table, Key: key, ConsistentRead: true }));
  return Item;
}

async function seedInvite(ownerId: string, to: string, overrides: Partial<InviteItem> = {}): Promise<InviteItem> {
  const invite: InviteItem = {
    id: randomUUID(),
    ownerId,
    email: to,
    tokenHash: hash(),
    createdAt: at(-HOUR_MS),
    expiresAt: at(24 * HOUR_MS),
    ...overrides,
  };
  await rawPut(encodeInvite(invite));
  await rawPut(encodeToken(invite.tokenHash, ownerId, invite.id));
  return invite;
}

describe.runIf(up)('invite retention (#146) on DynamoDB Local', () => {
  beforeAll(createTables);
  afterAll(dropTables);

  it('create sets ttl to the expiry plus 30 days', async () => {
    const owner = uid('owner');
    await profile(owner);
    const result = await createInvite(doc, table, caller(owner), `${uid('to')}@example.test`, hash(), clock);
    if (!result.ok) {
      throw new Error('create failed');
    }
    const stored = await raw(inviteKey(owner, result.value.id));
    expect(stored?.['ttl']).toBe(seconds(result.value.expiresAt) + THIRTY_DAYS);
    expect(stored?.['ttl']).toBe(NOW_SECONDS + 7 * DAY + THIRTY_DAYS);
  });

  it('an open invite keeps the expiry-based ttl and is still listed', async () => {
    const owner = uid('owner');
    await profile(owner);
    const created = await createInvite(doc, table, caller(owner), `${uid('to')}@example.test`, hash(), clock);
    if (!created.ok) {
      throw new Error('create failed');
    }
    const view = await listMembers(doc, table, caller(owner), clock);
    expect(view).toMatchObject({ role: 'owner', invites: [{ id: created.value.id }] });
    expect((await raw(inviteKey(owner, created.value.id)))?.['ttl']).toBe(NOW_SECONDS + 7 * DAY + THIRTY_DAYS);
  });

  it('revoke sets ttl to the revoke time plus 30 days, in the same write', async () => {
    const owner = uid('owner');
    await profile(owner);
    const invite = await seedInvite(owner, `${uid('to')}@example.test`, { ttl: NOW_SECONDS + 24 * 3600 + THIRTY_DAYS });
    expect(await revokeInvite(doc, table, caller(owner), invite.id, clock)).toEqual({ ok: true, value: null });
    const stored = await raw(inviteKey(owner, invite.id));
    expect(stored).toMatchObject({ revokedAt: clock.now().toISOString(), ttl: NOW_SECONDS + THIRTY_DAYS });
  });

  it('revoking an invite that already expired keeps the earlier, expiry-based ttl', async () => {
    const owner = uid('owner');
    await profile(owner);
    const expiresAt = at(-3 * DAY * 1000);
    const invite = await seedInvite(owner, `${uid('to')}@example.test`, { expiresAt, createdAt: at(-10 * DAY * 1000) });
    expect(await revokeInvite(doc, table, caller(owner), invite.id, clock)).toEqual({ ok: true, value: null });
    expect((await raw(inviteKey(owner, invite.id)))?.['ttl']).toBe(seconds(expiresAt) + THIRTY_DAYS);
  });

  it('retiring an expired invite while creating a new one to the same address keeps the expiry-based ttl', async () => {
    const owner = uid('owner');
    await profile(owner);
    const to = `${uid('to')}@example.test`;
    const expiresAt = at(-DAY * 1000);
    const old = await seedInvite(owner, to, { expiresAt, createdAt: at(-8 * DAY * 1000) });
    const created = await createInvite(doc, table, caller(owner), to, hash(), clock);
    expect(created.ok).toBe(true);
    expect(await raw(inviteKey(owner, old.id))).toMatchObject({
      revokedAt: clock.now().toISOString(),
      ttl: seconds(expiresAt) + THIRTY_DAYS,
    });
  });

  it('accept sets ttl to the acceptance time plus 30 days, in the same transaction as the membership', async () => {
    const owner = uid('owner');
    const joiner = uid('joiner');
    await profile(owner);
    await profile(joiner);
    const invite = await seedInvite(owner, `${joiner}@example.test`);
    // One of the joiner's own live invites is revoked in the same transaction: it gets a revoke ttl too.
    const own = await seedInvite(joiner, `${uid('to')}@example.test`);

    expect(await acceptInvite(doc, table, caller(joiner), invite.tokenHash, clock)).toEqual({
      ok: true,
      value: { ownerId: owner },
    });

    expect(await raw(inviteKey(owner, invite.id))).toMatchObject({
      acceptedAt: clock.now().toISOString(),
      ttl: NOW_SECONDS + THIRTY_DAYS,
    });
    expect(await raw(inviteKey(joiner, own.id))).toMatchObject({
      revokedAt: clock.now().toISOString(),
      ttl: NOW_SECONDS + THIRTY_DAYS,
    });
    expect(await raw(memberOfKey(joiner))).toMatchObject({ ownerId: owner });
  });

  it('gives no membership or profile item a ttl', async () => {
    const owner = uid('owner');
    const joiner = uid('joiner');
    await profile(owner);
    await profile(joiner);
    const invite = await seedInvite(owner, `${joiner}@example.test`);
    const created = await createInvite(doc, table, caller(owner), `${uid('to')}@example.test`, hash(), clock);
    expect(created.ok).toBe(true);
    await acceptInvite(doc, table, caller(joiner), invite.tokenHash, clock);

    for (const key of [memberOfKey(joiner), memberKey(owner, joiner), profileKey(owner), profileKey(joiner)]) {
      const stored = await raw(key);
      expect(stored).toBeDefined();
      expect(stored).not.toHaveProperty('ttl');
    }
  });

  describe('an invite whose ttl has passed but is not yet deleted', () => {
    it('is not listed, and an accept with its token is unusable', async () => {
      const owner = uid('owner');
      const joiner = uid('joiner');
      await profile(owner);
      await profile(joiner);
      // Stored and still readable raw, but its ttl is 10 seconds before the clock.
      const stale = await seedInvite(owner, `${joiner}@example.test`, { ttl: NOW_SECONDS - 10 });
      expect(await raw(inviteKey(owner, stale.id))).toBeDefined();

      expect(await listMembers(doc, table, caller(owner), clock)).toEqual({ role: 'owner', members: [], invites: [] });
      expect(await acceptInvite(doc, table, caller(joiner), stale.tokenHash, clock)).toEqual({ ok: false, code: 'unusable' });
      expect(await raw(memberOfKey(joiner))).toBeUndefined();
    });

    it('does not block a new invite to the same address, or count toward the open limit', async () => {
      const owner = uid('owner');
      await profile(owner);
      const to = `${uid('to')}@example.test`;
      await seedInvite(owner, to, { ttl: NOW_SECONDS - 10 });
      const created = await createInvite(doc, table, caller(owner), to, hash(), clock);
      expect(created.ok).toBe(true);
    });

    it('is not revocable: it answers not_found', async () => {
      const owner = uid('owner');
      await profile(owner);
      const stale = await seedInvite(owner, `${uid('to')}@example.test`, { ttl: NOW_SECONDS - 10 });
      expect(await revokeInvite(doc, table, caller(owner), stale.id, clock)).toEqual({ ok: false, code: 'not_found' });
    });

    it('is listed at a clock before its ttl and not at one after it: the same stored item', async () => {
      const owner = uid('owner');
      await profile(owner);
      const ttl = NOW_SECONDS + 100;
      const invite = await seedInvite(owner, `${uid('to')}@example.test`, { ttl });
      const before = fixedClock(new Date((ttl - 1) * 1000));
      const after = fixedClock(new Date((ttl + 1) * 1000));
      expect(await listMembers(doc, table, caller(owner), before)).toMatchObject({ invites: [{ id: invite.id }] });
      expect(await listMembers(doc, table, caller(owner), after)).toMatchObject({ invites: [] });
    });
  });

  describe('the TOKEN# guard and account deletion', () => {
    it('revoke strips the owner and invite ids from the guard, which stays', async () => {
      const owner = uid('owner');
      await profile(owner);
      const invite = await seedInvite(owner, `${uid('to')}@example.test`);
      await revokeInvite(doc, table, caller(owner), invite.id, clock);
      const guard = await raw(tokenKey(invite.tokenHash));
      expect(guard).toMatchObject({ entity: 'TOKEN' });
      for (const name of ['ownerId', 'inviteId', 'gsi1pk', 'gsi1sk']) {
        expect(guard).not.toHaveProperty(name);
      }
    });

    it('accept strips the owner and invite ids from the guard, which stays', async () => {
      const owner = uid('owner');
      const joiner = uid('joiner');
      await profile(owner);
      await profile(joiner);
      const invite = await seedInvite(owner, `${joiner}@example.test`);
      await acceptInvite(doc, table, caller(joiner), invite.tokenHash, clock);
      const guard = await raw(tokenKey(invite.tokenHash));
      expect(guard).toMatchObject({ entity: 'TOKEN' });
      for (const name of ['ownerId', 'inviteId', 'gsi1pk', 'gsi1sk']) {
        expect(guard).not.toHaveProperty(name);
      }
    });

    it('deleteUser removes the guard of an invite whose INVITE# item is already gone', async () => {
      const owner = uid('owner');
      await profile(owner);
      const tokenHash = hash();
      const created = await createInvite(doc, table, caller(owner), `${uid('to')}@example.test`, tokenHash, clock);
      if (!created.ok) {
        throw new Error('create failed');
      }
      expect(await raw(tokenKey(tokenHash))).toMatchObject({ ownerId: owner });
      // What DynamoDB's TTL does once the invite has expired and the 30 days have passed.
      await doc.send(new DeleteCommand({ TableName: table, Key: inviteKey(owner, created.value.id) }));

      await deleteUser(doc, table, owner, clock);

      expect(await raw(tokenKey(tokenHash))).toBeUndefined();
    });
  });
});
