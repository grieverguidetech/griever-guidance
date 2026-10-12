// Shapes for family members and invites, shared by web, mobile and the gateway so they can't drift.
// No contact data appears here (C3): an invitee's email is typed by the owner, never picked.

export type AccountType = 'owner' | 'member';

export interface MemberSummary {
  id: string;
  name: string | null;
  email: string;
}

export interface PendingInvite {
  id: string;
  email: string;
  /** ISO 8601 timestamp. */
  expiresAt: string;
}

export type MembersView =
  | { role: 'owner'; members: MemberSummary[]; invites: PendingInvite[] }
  | { role: 'member'; owner: { id: string; name: string | null } };

export interface CreateInviteRequest {
  email: string;
}

/**
 * The single-use secret from the invite link. Send it only in a request body. Never put it in a URL,
 * a log line or an error message.
 */
export interface AcceptInviteRequest {
  token: string;
}

export interface AcceptInviteResponse {
  ownerId: string;
}

/** 43 URL-safe characters: 32 random bytes, base64url without padding. */
export const INVITE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

const MAX_EMAIL_LENGTH = 254;

export function normalizeInviteEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

/** Expects an already-normalised address. Deliberately loose: the mail provider is the real check. */
export function isValidInviteEmail(email: string): boolean {
  if (email.length === 0 || email.length > MAX_EMAIL_LENGTH) return false;
  if (/\s/.test(email)) return false;
  const parts = email.split('@');
  if (parts.length !== 2) return false;
  const [local, domain] = parts as [string, string];
  if (local.length === 0) return false;
  // A dot inside the domain, with something on both sides.
  const dot = domain.indexOf('.');
  return dot > 0 && dot < domain.length - 1;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}
