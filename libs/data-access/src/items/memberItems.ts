import { memberKey, memberOfKey } from '../keys.js';
import { type Item } from '../read.js';

/** The membership marker in the member's own partition. Other rules read `ownerId` from it. */
export interface MemberOfItem {
  memberId: string;
  ownerId: string;
  createdAt: string;
}

/** The membership row in the owner's partition. It keeps the email the member accepted with. */
export interface MemberItem {
  ownerId: string;
  memberId: string;
  email: string;
  createdAt: string;
}

/**
 * The exact attributes of the MEMBER_OF item (design §1.2). No contact, draft or message data (C2, C3).
 * Listed one by one, never spread.
 */
export function encodeMemberOf(item: MemberOfItem): Item {
  return {
    ...memberOfKey(item.memberId),
    entity: 'MEMBER_OF',
    ownerId: item.ownerId,
    createdAt: item.createdAt,
  };
}

/** Only the owner is needed to read it. Older items may have no createdAt. */
export function decodeMemberOf(item: Item): { ownerId: string } {
  const { ownerId } = item;
  if (typeof ownerId !== 'string') {
    throw new Error('Membership item is broken.');
  }
  return { ownerId };
}

/**
 * The exact attributes of the MEMBER# item. The email is copied here and lives only while the person
 * is a member, because accepted invites are deleted after 30 days.
 */
export function encodeMember(item: MemberItem): Item {
  return {
    ...memberKey(item.ownerId, item.memberId),
    entity: 'MEMBER',
    ownerId: item.ownerId,
    memberId: item.memberId,
    email: item.email,
    createdAt: item.createdAt,
  };
}

export function decodeMember(item: Item): MemberItem {
  const { ownerId, memberId, email, createdAt } = item;
  if (
    typeof ownerId !== 'string' ||
    typeof memberId !== 'string' ||
    typeof email !== 'string' ||
    typeof createdAt !== 'string'
  ) {
    throw new Error('Member item is broken.');
  }
  return { ownerId, memberId, email, createdAt };
}
