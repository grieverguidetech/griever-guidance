/**
 * The invitation link on the phone (#232), as web's lib/joinLink (#128). The link
 * `https://web.grieversguidance.com/join#t=<token>` is read with core `Linking` (at launch and while
 * the app runs). The token is kept on this phone for 7 days and only ever leaves this module in the
 * body of `acceptInvite`. It is never logged, put in a URL, or shown.
 */
import { Linking } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { INVITE_TOKEN_PATTERN, joinTokenFromUrl } from '@griever/shared';
import { acceptInvite, getProfile } from '@griever/api-client';
import type { AcceptInviteResult } from '@griever/api-client';

export const JOIN_STORAGE_KEY = 'gg.join.v1';
/** A saved link is dropped after 7 days; the invitation itself expires sooner on the server. */
export const JOIN_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
/** The longest a whole join may take (every call in it); past it the link is kept and the app opens (C5). */
export const JOIN_WAIT_MS = 15000;

/** The saved token, or null. A broken, foreign or expired entry is removed. */
export async function savedJoinToken(now: number = Date.now()): Promise<string | null> {
  let raw: string | null = null;
  try {
    raw = await AsyncStorage.getItem(JOIN_STORAGE_KEY);
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
  await clearJoinToken();
  return null;
}

async function saveJoinToken(token: string, now: number): Promise<void> {
  try {
    await AsyncStorage.setItem(JOIN_STORAGE_KEY, JSON.stringify({ token, savedAt: now }));
  } catch {
    // Storage failed: the token held in memory still works for this launch.
  }
}

/**
 * The token is used up (joined, or refused) or not wanted (sharing off): forget it. With `expected`,
 * only that token is removed: a newer link saved meanwhile stays.
 */
export async function clearJoinToken(expected?: string): Promise<void> {
  try {
    if (expected !== undefined) {
      const raw = await AsyncStorage.getItem(JOIN_STORAGE_KEY);
      const stored = raw === null ? null : (JSON.parse(raw) as { token?: unknown }).token;
      if (stored !== undefined && stored !== expected && raw !== null) {
        return;
      }
    }
    await AsyncStorage.removeItem(JOIN_STORAGE_KEY);
  } catch {
    // Nothing to remove.
  }
}

/**
 * Reports the waiting token: the one in the link the app was opened with, else a saved one, and then
 * every link that arrives while the app runs. Returns a function that stops listening.
 */
export function watchJoinLink(onToken: (token: string) => void): () => void {
  let live = true;
  const take = async (url: string | null | undefined): Promise<boolean> => {
    const token = typeof url === 'string' ? joinTokenFromUrl(url) : null;
    if (token === null) {
      return false;
    }
    await saveJoinToken(token, Date.now());
    if (live) {
      onToken(token);
    }
    return true;
  };
  const subscription = Linking.addEventListener('url', ({ url }) => {
    void take(url);
  });
  void (async () => {
    let initial: string | null | undefined = null;
    try {
      initial = await Linking.getInitialURL();
    } catch {
      initial = null;
    }
    if (await take(initial)) {
      return;
    }
    const saved = await savedJoinToken();
    if (saved !== null && live) {
      onToken(saved);
    }
  })();
  return () => {
    live = false;
    subscription.remove();
  };
}

/**
 * What an accept answer means for the saved link (as web). `null` is no answer in time.
 * - `joined`: done; drop the link.
 * - `unusable` (a dead link, or refused as malformed or not allowed) and `conflict` (this account has
 *   people of its own): drop the link, after checking the account is not already a member.
 * - `offline` and `later` (busy, too many tries, signed out, any other failure): keep the link.
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

/** A join's result: a joinOutcome, or `member` when the server says this account is a member already. */
export type JoinRun = JoinOutcome | 'member';

const TIMED_OUT = Symbol('timed out');

/**
 * Joins with the invitation, every step inside one `waitMs` budget; running out reads as offline (the
 * link stays saved). Only a profile the server answers now may say "already a member" (never a cached
 * one): asked before accepting, and again after a refusal, which may only mean an earlier join worked.
 */
export async function runJoin(getAccessToken: () => Promise<string | null>, inviteToken: string, waitMs: number = JOIN_WAIT_MS): Promise<JoinRun> {
  const deadline = Date.now() + waitMs;
  async function within<T>(work: Promise<T>): Promise<T | typeof TIMED_OUT> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timedOut = new Promise<typeof TIMED_OUT>((resolve) => {
      timer = setTimeout(() => resolve(TIMED_OUT), Math.max(0, deadline - Date.now()));
    });
    try {
      return await Promise.race([work, timedOut]);
    } finally {
      clearTimeout(timer);
    }
  }
  const access = await within(getAccessToken().catch(() => null));
  if (access === TIMED_OUT || access === null) {
    return 'offline';
  }
  async function isMember(): Promise<boolean | typeof TIMED_OUT> {
    const fresh = await within(getProfile(access as string).catch(() => null));
    if (fresh === TIMED_OUT) {
      return TIMED_OUT;
    }
    return fresh?.ok === true && fresh.profile.accountType === 'member';
  }
  const before = await isMember();
  if (before === TIMED_OUT) {
    return 'offline';
  }
  if (before) {
    return 'member';
  }
  const result = await within(acceptInvite(access, inviteToken).catch(() => null));
  const outcome = joinOutcome(result === TIMED_OUT ? null : result);
  if (outcome !== 'unusable' && outcome !== 'conflict') {
    return outcome;
  }
  const after = await isMember();
  if (after === TIMED_OUT) {
    return 'offline';
  }
  return after ? 'member' : outcome;
}
