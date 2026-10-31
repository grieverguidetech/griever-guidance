import { randomUUID } from 'node:crypto';
import { fixedClock } from '../clock.js';
import { encodeInvite, type InviteItem } from '../items/inviteItems.js';
import { encodeMember, encodeMemberOf } from '../items/memberItems.js';
import { encodeProfile, getProfile } from '../items/profileItem.js';
import { memberKey, memberOfKey } from '../keys.js';
import { getLive } from '../read.js';
import { createTables, doc, dropTables, rawPut, table, up } from '../testing/localTable.js';
import { listMembers, removeMember } from './members.js';

const clock = fixedClock('2026-10-24T12:00:00.000Z');
const HOUR = 60 * 60 * 1000;
const at = (offsetMs: number) => new Date(clock.now().getTime() + offsetMs).toISOString();
const caller = (userId: string) => ({ userId, email: `${userId}@example.test`, emailVerified: true });

const profile = (userId: string, accountType: 'owner' | 'member' = 'owner', senderName?: string, version = 1) =>
  // Private fields on every fixture, so a leak into the members list fails the toEqual checks.
  rawPut(encodeProfile({ userId, accountType, version, senderName, fullName: 'Owner Private', birthDate: '1970-01-01', createdAt: at(-99 * HOUR), updatedAt: at(-99 * HOUR) }));

const join = async (ownerId: string, memberId: string, email: string, createdAt: string, senderName?: string) => {
  await profile(memberId, 'member', senderName);
  await rawPut(encodeMember({ ownerId, memberId, email, createdAt }));
  await rawPut(encodeMemberOf({ memberId, ownerId, createdAt }));
};

const invite = (ownerId: string, overrides: Partial<InviteItem>): InviteItem => ({
  id: randomUUID(),
  ownerId,
  email: `${randomUUID().slice(0, 8)}@example.test`,
  tokenHash: 'b'.repeat(64),
  createdAt: at(-HOUR),
  expiresAt: at(24 * HOUR),
  ...overrides,
});

describe.runIf(up)('listMembers on DynamoDB Local', () => {
  const OWNER = 'user_l_owner';
  const MEMBER_A = 'user_l_a';
  const MEMBER_B = 'user_l_b';

  beforeAll(async () => {
    await createTables();
    await profile(OWNER, 'owner', 'Pat');
    // B joined first, so it comes first although its id sorts later.
    await join(OWNER, MEMBER_B, 'b@example.test', at(-5 * HOUR), 'Bea');
    await join(OWNER, MEMBER_A, 'a@example.test', at(-2 * HOUR));
    const newer = invite(OWNER, { email: 'newer@example.test', createdAt: at(-HOUR) });
    const older = invite(OWNER, { email: 'older@example.test', createdAt: at(-3 * HOUR) });
    for (const item of [
      newer,
      older,
      invite(OWNER, { email: 'expired@example.test', expiresAt: at(-HOUR) }),
      invite(OWNER, { email: 'revoked@example.test', revokedAt: at(-HOUR) }),
      invite(OWNER, { email: 'accepted@example.test', acceptedAt: at(-HOUR), acceptedBy: MEMBER_A }),
    ]) {
      await rawPut(encodeInvite(item));
    }
  });
  afterAll(dropTables);

  it('gives the owner members in join order and open unexpired invites in creation order', async () => {
    const view = await listMembers(doc, table, caller(OWNER), clock);
    expect(view).toEqual({
      role: 'owner',
      members: [
        { id: MEMBER_B, name: 'Bea', email: 'b@example.test' },
        { id: MEMBER_A, name: null, email: 'a@example.test' },
      ],
      invites: [
        expect.objectContaining({ email: 'older@example.test' }),
        expect.objectContaining({ email: 'newer@example.test' }),
      ],
    });
  });

  it('never includes a token hash', async () => {
    const text = JSON.stringify(await listMembers(doc, table, caller(OWNER), clock));
    expect(text).not.toContain('b'.repeat(64));
    expect(text).not.toContain('tokenHash');
  });

  it('gives a member the owner view of their owner only', async () => {
    expect(await listMembers(doc, table, caller(MEMBER_A), clock)).toEqual({
      role: 'member',
      owner: { id: OWNER, name: 'Pat' },
    });
  });

  it('gives a stranger an empty owner view', async () => {
    expect(await listMembers(doc, table, caller('user_l_stranger'), clock)).toEqual({
      role: 'owner',
      members: [],
      invites: [],
    });
  });
});

describe.runIf(up)('removeMember on DynamoDB Local', () => {
  beforeAll(createTables);
  afterAll(dropTables);

  it('deletes both membership items and puts the member back to owner with a version bump', async () => {
    await profile('user_r_owner', 'owner');
    await join('user_r_owner', 'user_r_m', 'm@example.test', at(-HOUR));
    expect(await removeMember(doc, table, caller('user_r_owner'), 'user_r_m', clock)).toEqual({ ok: true, value: null });
    expect(await getLive(doc, table, memberKey('user_r_owner', 'user_r_m'), clock)).toBeUndefined();
    expect(await getLive(doc, table, memberOfKey('user_r_m'), clock)).toBeUndefined();
    expect(await getProfile(doc, table, 'user_r_m', clock)).toMatchObject({ accountType: 'owner', version: 2 });
    expect(await getProfile(doc, table, 'user_r_owner', clock)).toMatchObject({ accountType: 'owner', version: 2 });
  });

  it('removes a MEMBER# item that has no MEMBER_OF', async () => {
    await profile('user_r_o5', 'owner');
    await rawPut(encodeMember({ ownerId: 'user_r_o5', memberId: 'user_r_m5', email: 'm5@example.test', createdAt: at(-HOUR) }));
    expect(await removeMember(doc, table, caller('user_r_o5'), 'user_r_m5', clock)).toEqual({ ok: true, value: null });
    expect(await getLive(doc, table, memberKey('user_r_o5', 'user_r_m5'), clock)).toBeUndefined();
  });

  it("answers not_found for another owner's member and changes nothing", async () => {
    await profile('user_r_o1', 'owner');
    await profile('user_r_o2', 'owner');
    await join('user_r_o2', 'user_r_m2', 'm2@example.test', at(-HOUR));
    expect(await removeMember(doc, table, caller('user_r_o1'), 'user_r_m2', clock)).toEqual({ ok: false, code: 'not_found' });
    expect(await getLive(doc, table, memberOfKey('user_r_m2'), clock)).toMatchObject({ ownerId: 'user_r_o2' });
    expect(await getProfile(doc, table, 'user_r_m2', clock)).toMatchObject({ accountType: 'member', version: 1 });
    expect(await getProfile(doc, table, 'user_r_o1', clock)).toMatchObject({ version: 1 });
  });

  it('answers not_found for the caller themself, an unknown id and a bad id', async () => {
    await profile('user_r_o3', 'owner');
    for (const id of ['user_r_o3', 'user_r_nobody', 'bad#id', '']) {
      expect(await removeMember(doc, table, caller('user_r_o3'), id, clock)).toEqual({ ok: false, code: 'not_found' });
    }
    expect(await getProfile(doc, table, 'user_r_o3', clock)).toMatchObject({ accountType: 'owner', version: 1 });
  });

  it('answers not_found when the member was already removed before the commit', async () => {
    await profile('user_r_o4', 'owner');
    await join('user_r_o4', 'user_r_m4', 'm4@example.test', at(-HOUR));
    const first = await removeMember(doc, table, caller('user_r_o4'), 'user_r_m4', clock, {
      beforeCommit: async () => {
        await removeMember(doc, table, caller('user_r_o4'), 'user_r_m4', clock);
      },
    });
    expect(first).toEqual({ ok: false, code: 'not_found' });
    expect(await getProfile(doc, table, 'user_r_m4', clock)).toMatchObject({ accountType: 'owner', version: 2 });
  });
});
