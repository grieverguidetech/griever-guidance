import type { PendingInvite } from '@griever/shared';
import { inviteKey, refGsi, tokenKey } from '../keys.js';
import { type Item } from '../read.js';

export interface InviteItem {
  id: string;
  ownerId: string;
  email: string;
  /** sha256 hex of the token. Stays inside this lib: no output shape carries it. */
  tokenHash: string;
  createdAt: string;
  expiresAt: string;
  acceptedAt?: string;
  acceptedBy?: string;
  revokedAt?: string;
}

/**
 * The exact attributes of an INVITE# item (design §1.2). Listed one by one, never spread.
 * The gsi1 keys appear only once someone accepted, so account deletion can find that user's invite.
 */
export function encodeInvite(invite: InviteItem): Item {
  return {
    ...inviteKey(invite.ownerId, invite.id),
    entity: 'INVITE',
    id: invite.id,
    ownerId: invite.ownerId,
    email: invite.email,
    tokenHash: invite.tokenHash,
    createdAt: invite.createdAt,
    expiresAt: invite.expiresAt,
    ...(invite.acceptedAt ? { acceptedAt: invite.acceptedAt } : {}),
    ...(invite.acceptedBy ? { acceptedBy: invite.acceptedBy } : {}),
    ...(invite.revokedAt ? { revokedAt: invite.revokedAt } : {}),
    ...(invite.acceptedBy ? refGsi(invite.acceptedBy, 'INVITE', invite.id) : {}),
  };
}

export function decodeInvite(item: Item): InviteItem {
  const { id, ownerId, email, tokenHash, createdAt, expiresAt, acceptedAt, acceptedBy, revokedAt } = item;
  if (
    typeof id !== 'string' ||
    typeof ownerId !== 'string' ||
    typeof email !== 'string' ||
    typeof tokenHash !== 'string' ||
    typeof createdAt !== 'string' ||
    typeof expiresAt !== 'string'
  ) {
    throw new Error('Invite item is broken.');
  }
  const invite: InviteItem = { id, ownerId, email, tokenHash, createdAt, expiresAt };
  if (typeof acceptedAt === 'string') {
    invite.acceptedAt = acceptedAt;
  }
  if (typeof acceptedBy === 'string') {
    invite.acceptedBy = acceptedBy;
  }
  if (typeof revokedAt === 'string') {
    invite.revokedAt = revokedAt;
  }
  return invite;
}

/** An invite nobody has accepted or revoked yet. It may still be expired. */
export function isOpen(invite: InviteItem): boolean {
  return !invite.acceptedAt && !invite.revokedAt;
}

/** The only shape an invite leaves this lib in. Built field by field, so `tokenHash` cannot leak. */
export function toPendingInvite(invite: InviteItem): PendingInvite {
  return {
    id: invite.id,
    email: invite.email,
    expiresAt: invite.expiresAt,
    createdAt: invite.createdAt,
  };
}

/**
 * The TOKEN# guard item. Its key makes a hash unique across all owners. It is kept after a revoke,
 * so a used hash can never be used again (same as the unique token_hash column).
 */
export function encodeToken(hash: string, ownerId: string, inviteId: string): Item {
  return {
    ...tokenKey(hash),
    entity: 'TOKEN',
    ownerId,
    inviteId,
  };
}
