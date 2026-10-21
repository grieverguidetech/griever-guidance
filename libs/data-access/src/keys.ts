import { isUuid } from '@griever/shared';

/**
 * Rule: key strings are built only in this file. Other files call these builders (a test scans src for
 * `USER#` templates). Every key for the gg-data table (design #187 §1.2). Each builder checks its input first, so a
 * typed value can never forge another key (no `#`) and no email can end up in a key (C3).
 */
const USER_ID = /^[A-Za-z0-9_-]{1,64}$/;
const TOKEN_HASH = /^[0-9a-f]{64}$/;

export interface Key {
  pk: string;
  sk: string;
}

function userId(value: string): string {
  if (!USER_ID.test(value)) throw new Error('Invalid user id for a data key.');
  return value;
}

function uuid(what: string, value: string): string {
  if (!isUuid(value)) throw new Error(`Invalid ${what} id for a data key.`);
  // Lower case, so "ABC..." and "abc..." are the same key and a flow guard stays unique.
  return value.toLowerCase();
}

function tokenHash(value: string): string {
  if (!TOKEN_HASH.test(value)) throw new Error('Invalid token hash for a data key.');
  return value;
}

export const userPk = (id: string): string => `USER#${userId(id)}`;

export const profileKey = (id: string): Key => ({ pk: userPk(id), sk: 'PROFILE' });
export const flowKey = (ownerId: string, flowId: string): Key => ({
  pk: userPk(ownerId),
  sk: `FLOW#${uuid('flow', flowId)}`,
});
export const flowGuardKey = (flowId: string): Key => ({ pk: `FLOW#${uuid('flow', flowId)}`, sk: 'FLOW' });
export const memberOfKey = (memberId: string): Key => ({ pk: userPk(memberId), sk: 'MEMBER_OF' });
export const memberKey = (ownerId: string, memberId: string): Key => ({
  pk: userPk(ownerId),
  sk: `MEMBER#${userId(memberId)}`,
});
export const inviteKey = (ownerId: string, inviteId: string): Key => ({
  pk: userPk(ownerId),
  sk: `INVITE#${uuid('invite', inviteId)}`,
});
export const tokenKey = (hash: string): Key => ({ pk: `TOKEN#${tokenHash(hash)}`, sk: 'TOKEN' });

/** Sort-key prefixes for `begins_with` queries inside one owner partition. */
export const FLOW_PREFIX = 'FLOW#';
export const MEMBER_PREFIX = 'MEMBER#';
export const INVITE_PREFIX = 'INVITE#';
export type SkPrefix = typeof FLOW_PREFIX | typeof MEMBER_PREFIX | typeof INVITE_PREFIX;

/** gsi1 keys: items that point at a user. Used only by account deletion. */
export function refGsi(id: string, kind: 'FLOW' | 'INVITE', itemId: string): { gsi1pk: string; gsi1sk: string } {
  return { gsi1pk: `REF#${userId(id)}`, gsi1sk: `${kind}#${uuid(kind.toLowerCase(), itemId)}` };
}
