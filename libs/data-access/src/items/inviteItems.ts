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
  /** Epoch seconds. DynamoDB deletes the item some time after this (see inviteTtl). Not read back. */
  ttl?: number;
}

/** Invite items, and the email on them, are kept this long after the invite closes (#146). */
export const INVITE_RETENTION_DAYS = 30;
const SECONDS_PER_DAY = 24 * 60 * 60;

/** The ttl (epoch seconds) that deletes an invite 30 days after `fromMs`. */
export function inviteTtl(fromMs: number): number {
  return Math.floor(fromMs / 1000) + INVITE_RETENTION_DAYS * SECONDS_PER_DAY;
}

/**
 * The ttl for an invite that closes at `closedAtMs` (revoke or accept): 30 days after the close, or
 * 30 days after expiry when that comes first. The earlier one wins, so an invite revoked after it
 * expired keeps its expiry-based ttl.
 */
export function closedInviteTtl(expiresAt: string, closedAtMs: number): number {
  return Math.min(inviteTtl(Date.parse(expiresAt)), inviteTtl(closedAtMs));
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
    ...(invite.ttl === undefined ? {} : { ttl: invite.ttl }),
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
