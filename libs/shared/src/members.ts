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
  /** ISO 8601 timestamp. */
  createdAt: string;
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

const MAX_DOMAIN_LENGTH = 253;
const MAX_LOCAL_LENGTH = 64;
// Whitespace, specials that change how an address parses, control and zero-width characters.
const FORBIDDEN_LOCAL_CHARS = /[\s@<>()[\]\\,;:"\u0000-\u001f\u007f\u200b-\u200d\ufeff]/;
// One LDH label: letters, digits and inner hyphens, 1-63 characters.
const DOMAIN_LABEL = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/i;

/**
 * Strict on purpose (C8): the address goes into an email and a database. ASCII only for now, so an
 * internationalised address is rejected. Expects an already-normalised address.
 */
export function isValidInviteEmail(email: string): boolean {
  if (email.length > MAX_EMAIL_LENGTH) return false;
  const parts = email.split('@');
  if (parts.length !== 2) return false;
  const [local, domain] = parts as [string, string];
  if (local.length < 1 || local.length > MAX_LOCAL_LENGTH) return false;
  if (FORBIDDEN_LOCAL_CHARS.test(local)) return false;
  if (domain.length > MAX_DOMAIN_LENGTH) return false;
  const labels = domain.split('.');
  return labels.length >= 2 && labels.every((l) => DOMAIN_LABEL.test(l));
}

/** Normalises and validates in one step. Null when the address is not usable. */
export function parseInviteEmail(raw: string): string | null {
  const email = normalizeInviteEmail(raw);
  return isValidInviteEmail(email) ? email : null;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

// A user id is the Clerk id (`user_...`), the `sub` of the session token. It is not a UUID.
const USER_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export function isUserId(value: string): boolean {
  return USER_ID_PATTERN.test(value);
}
