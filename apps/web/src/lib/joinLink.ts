/**
 * The invitation link (#128): `/join#t=<token>`. The token is read from the fragment only (a fragment
 * is never sent to a server), kept in memory and on this device for 7 days, and taken out of the
 * address bar at once. It only ever leaves this module for the body of `acceptInvite`.
 */
import { INVITE_TOKEN_PATTERN } from '@griever/shared';
import type { AcceptInviteResult } from '@griever/api-client';

export const JOIN_STORAGE_KEY = 'gg.join.v1';
/** A saved link is dropped after 7 days; the invitation itself expires sooner on the server. */
export const JOIN_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
export const JOIN_PATH = '/join';

/** The token in a `/join` URL's fragment (`#t=`), or null. A query string (`?t=`) is ignored. */
export function joinTokenFromUrl(href: string): string | null {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  if (url.pathname !== JOIN_PATH) {
    return null;
  }
  const token = new URLSearchParams(url.hash.replace(/^#/, '')).get('t');
  return token !== null && INVITE_TOKEN_PATTERN.test(token) ? token : null;
}

// Held in memory from the first call, so a blocked storage still lets this load join.
let captured: string | null = null;

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function save(token: string, now: number): void {
  try {
    storage()?.setItem(JOIN_STORAGE_KEY, JSON.stringify({ token, savedAt: now }));
  } catch {
    // Storage full or blocked: the token in memory still works for this load.
  }
}

/** The saved token, or null. A broken, foreign or expired entry is removed. */
function readSaved(now: number): string | null {
  const store = storage();
  if (!store) {
    return null;
  }
  let raw: string | null = null;
  try {
    raw = store.getItem(JOIN_STORAGE_KEY);
  } catch {
    return null;
  }
  if (raw === null) {
    return null;
  }
  try {
    const value = JSON.parse(raw) as { token?: unknown; savedAt?: unknown };
    const fresh = typeof value.savedAt === 'number' && now - value.savedAt >= 0 && now - value.savedAt < JOIN_MAX_AGE_MS;
    if (typeof value.token === 'string' && INVITE_TOKEN_PATTERN.test(value.token) && fresh) {
      return value.token;
    }
  } catch {
    // Not JSON: dropped below.
  }
  try {
    store.removeItem(JOIN_STORAGE_KEY);
  } catch {
    // Blocked: nothing to remove.
  }
  return null;
}

/**
 * Call as early as possible (before the router reads the URL) and again on render: safe to repeat.
 * On `/join`, keeps a valid fragment token and replaces the address with plain `/join`, so the token is
 * not kept in history, shared or shown. The history entry's state is kept (React Router stores its own there).
 */
export function captureJoinLink(now: number = Date.now()): void {
  if (window.location.pathname !== JOIN_PATH) {
    return;
  }
  const token = joinTokenFromUrl(window.location.href);
  if (token !== null) {
    captured = token;
    save(token, now);
  }
  if (window.location.hash !== '' || window.location.search !== '') {
    window.history.replaceState(window.history.state, '', JOIN_PATH);
  }
}

/** The token waiting to be used (this load's, or one saved on an earlier load), or null. */
export function savedJoinToken(now: number = Date.now()): string | null {
  const saved = readSaved(now);
  if (captured !== null) {
    return captured;
  }
  return saved;
}

/** The token is used up (joined, or refused) or not wanted (sharing off): forget it everywhere. */
export function clearJoinToken(): void {
  captured = null;
  try {
    storage()?.removeItem(JOIN_STORAGE_KEY);
  } catch {
    // Blocked: nothing to remove.
  }
}

/**
 * What an accept answer means for the saved link. `null` is no answer in time, or no session token.
 * - `joined`: done; drop the link.
 * - `unusable` (a dead link: wrong, expired, used, revoked, or refused as malformed or not allowed) and
 *   `conflict` (this account has people of its own): drop the link, after checking the account is not
 *   already a member (then it joined earlier, and nothing is said).
 * - `offline` and `later` (busy, too many tries, signed out, any other failure): keep the link for a later load.
 */
export type JoinOutcome = 'joined' | 'unusable' | 'conflict' | 'offline' | 'later';

export function joinOutcome(result: AcceptInviteResult | null): JoinOutcome {
  if (result === null) {
    return 'offline';
  }
  if (result.ok) {
    return 'joined';
  }
  switch (result.reason) {
    case 'unusable':
    case 'invalid':
    case 'forbidden':
      return 'unusable';
    case 'conflict':
      return 'conflict';
    case 'offline':
      return 'offline';
    default:
      return 'later';
  }
}
