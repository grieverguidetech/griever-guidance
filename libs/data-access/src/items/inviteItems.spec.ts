import { decodeInvite, encodeInvite, encodeToken, toPendingInvite, type InviteItem } from './inviteItems.js';
import { decodeMember, decodeMemberOf, encodeMember, encodeMemberOf } from './memberItems.js';

const HASH = 'a'.repeat(64);
const invite: InviteItem = {
  id: '11111111-1111-4111-8111-111111111111',
  ownerId: 'user_owner1',
  email: 'sam@example.test',
  tokenHash: HASH,
  createdAt: '2026-10-01T00:00:00.000Z',
  expiresAt: '2026-10-08T00:00:00.000Z',
};

describe('invite codec', () => {
  it('writes exactly the attributes in design 1.2', () => {
    expect(Object.keys(encodeInvite(invite)).sort()).toEqual(
      ['pk', 'sk', 'entity', 'id', 'ownerId', 'email', 'tokenHash', 'createdAt', 'expiresAt'].sort(),
    );
  });

  it('adds state and the gsi1 keys only once accepted', () => {
    const accepted = { ...invite, acceptedAt: '2026-10-02T00:00:00.000Z', acceptedBy: 'user_member1' };
    expect(Object.keys(encodeInvite(accepted)).sort()).toEqual(
      ['pk', 'sk', 'entity', 'id', 'ownerId', 'email', 'tokenHash', 'createdAt', 'expiresAt', 'acceptedAt', 'acceptedBy', 'gsi1pk', 'gsi1sk'].sort(),
    );
    expect(decodeInvite(encodeInvite(accepted))).toEqual(accepted);
  });

  it('round-trips', () => {
    expect(decodeInvite(encodeInvite({ ...invite, revokedAt: '2026-10-03T00:00:00.000Z' }))).toEqual({
      ...invite,
      revokedAt: '2026-10-03T00:00:00.000Z',
    });
  });

  it('never stores an attribute that looks like contact or message data', () => {
    const items = [
      encodeInvite(invite),
      encodeToken(HASH, 'user_owner1', invite.id),
      encodeMember({ ownerId: 'user_owner1', memberId: 'user_member1', email: 'm@example.test', createdAt: invite.createdAt }),
      encodeMemberOf({ memberId: 'user_member1', ownerId: 'user_owner1', createdAt: invite.createdAt }),
    ];
    for (const item of items) {
      for (const name of Object.keys(item)) {
        expect(name).not.toMatch(/contact|recipient|draft|message|wording|body/i);
      }
    }
  });

  it('never puts the token hash in the pending invite', () => {
    const pending = toPendingInvite(invite);
    expect(Object.keys(pending).sort()).toEqual(['createdAt', 'email', 'expiresAt', 'id']);
    expect(JSON.stringify(pending)).not.toContain(HASH);
  });

  it('refuses a broken item', () => {
    expect(() => decodeInvite({ id: 'x' })).toThrow('Invite item is broken.');
  });
});

describe('member codecs', () => {
  it('writes exactly the MEMBER_OF attributes, keeping the shape flows reads', () => {
    const item = encodeMemberOf({ memberId: 'user_member1', ownerId: 'user_owner1', createdAt: '2026-10-01T00:00:00.000Z' });
    expect(Object.keys(item).sort()).toEqual(['pk', 'sk', 'entity', 'ownerId', 'createdAt'].sort());
    expect(item).toMatchObject({ pk: 'USER#user_member1', sk: 'MEMBER_OF', entity: 'MEMBER_OF', ownerId: 'user_owner1' });
    expect(decodeMemberOf(item)).toEqual({ ownerId: 'user_owner1' });
  });

  it('reads a MEMBER_OF item that has no createdAt', () => {
    expect(decodeMemberOf({ pk: 'USER#m', sk: 'MEMBER_OF', entity: 'MEMBER_OF', ownerId: 'user_owner1' })).toEqual({
      ownerId: 'user_owner1',
    });
  });

  it('writes exactly the MEMBER# attributes and round-trips', () => {
    const member = { ownerId: 'user_owner1', memberId: 'user_member1', email: 'm@example.test', createdAt: '2026-10-01T00:00:00.000Z' };
    const item = encodeMember(member);
    expect(Object.keys(item).sort()).toEqual(['pk', 'sk', 'entity', 'ownerId', 'memberId', 'email', 'createdAt'].sort());
    expect(decodeMember(item)).toEqual(member);
  });

  it('refuses broken items', () => {
    expect(() => decodeMember({ ownerId: 'x' })).toThrow('Member item is broken.');
    expect(() => decodeMemberOf({})).toThrow('Membership item is broken.');
  });
});
