import { useCallback, useEffect, useRef, useState } from 'react';
import { checkAddress, splitFullName } from '@griever/shared';
import type { AccountAuth, AccountAuthStatus, Address } from '@griever/shared';
import { getProfile, updateProfile } from '@griever/api-client';
import type { ProfileResult } from '@griever/api-client';
import { PROFILE_STORAGE_KEY, identityErrorMessage } from './accountCache.js';
import type { CachedProfile } from './accountCache.js';
import type { SendFlowStorage } from './useSendFlow.js';

/** Holds the signed-in user id, so a screen can show the right shell before the provider is ready. */
export const SIGNED_IN_STORAGE_KEY = 'gg.signedIn.v1';

export interface UseAccountOptions {
  /** The app's sign-in adapter. It may be a new object on every render; only its fields are read. */
  auth: AccountAuth;
  /** Read once at mount; a later `storage` prop is ignored. */
  storage?: SendFlowStorage;
}

export interface UseAccountResult {
  status: AccountAuthStatus;
  isSignedIn: boolean;
  isLoading: boolean;
  /** The provider's id for the signed-in user; null when signed out or still loading. Known before the profile is. */
  userId?: string | null | undefined;
  /** True when signed in but the network could not be reached. */
  offline: boolean;
  /** null when signed out, when no profile exists yet (normal), or before one is known. */
  profile: CachedProfile | null;
  /** True once the server has answered the profile call (a profile, no profile, or a failure), or a cached profile exists. False only while the first answer is still pending. */
  profileAnswered: boolean;
  /** True only after a live answer for this sign-in with the stored profile or "no profile" (the account really has none): the profile call, or a save that returned it. Never from the cache, and not after unavailable, offline or a failed call. */
  profileLoaded: boolean;
  /** True when the first profile call for this sign-in was answered with a failure (offline, unavailable, refused). A profile kept on the device is then the best known copy; before that answer it may be stale. Optional so older stand-ins still fit. */
  profileLoadFailed?: boolean;
  error: string | null;
  clearError: () => void;
  /** Asks the server for the profile again, after a first load that failed. Optional so older stand-ins for this result still fit. */
  reloadProfile?: () => void;
  signOut: () => Promise<void>;
  updateSenderName: (name: string) => Promise<boolean>;
  /** Saves the optional first name, last name, date of birth and address (null clears one). The server sets senderName from firstName. `invalid` means the server refused a value; no general error is set for it. */
  updateDetails: (details: ProfileDetails, options?: UpdateDetailsOptions) => Promise<ProfileDetailsResult>;
}

export interface UpdateDetailsOptions {
  /** A background save: a failure sets no account error and clears none, because nobody asked for it. */
  quiet?: boolean;
}

export interface ProfileDetails {
  /** Send these three together (the Personal details form). Leave them out to leave the stored values alone. */
  firstName?: string | null;
  lastName?: string | null;
  address?: Address | null;
  /** Deprecated: the old single-string name. The server still accepts it and leaves senderName alone; the web app no longer sends it. */
  fullName?: string | null;
  /** yyyy-mm-dd. Leave it out to leave the stored value alone. */
  birthDate?: string | null;
}

export type ProfileDetailsResult = { ok: true } | { ok: false; invalid: boolean };

function isCachedProfile(value: unknown): value is CachedProfile {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const { id, senderName, fullName, firstName, lastName, birthDate, address, contactSource, accountType } = value as Record<string, unknown>;
  return (
    typeof id === 'string' &&
    (senderName === null || typeof senderName === 'string') &&
    // Caches from before these fields existed have neither; that still counts.
    (fullName === undefined || fullName === null || typeof fullName === 'string') &&
    (firstName === undefined || firstName === null || typeof firstName === 'string') &&
    (lastName === undefined || lastName === null || typeof lastName === 'string') &&
    (birthDate === undefined || birthDate === null || typeof birthDate === 'string') &&
    (address === undefined || address === null || checkAddress(address).ok) &&
    (contactSource === null || contactSource === 'import' || contactSource === 'manual') &&
    (accountType === undefined || accountType === 'owner' || accountType === 'member')
  );
}

function readCache(storage: SendFlowStorage | undefined): CachedProfile | null {
  if (!storage) {
    return null;
  }
  try {
    const raw = storage.getItem(PROFILE_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed: unknown = JSON.parse(raw);
    if (!isCachedProfile(parsed)) {
      return null;
    }
    // A cache written before first and last name existed holds one fullName; split it the way the server does.
    const legacyFullName = (parsed as { fullName?: string | null }).fullName;
    const legacy = parsed.firstName || parsed.lastName ? null : splitFullName(legacyFullName);
    // A cache written before accountType existed reads as an owner.
    return {
      id: parsed.id,
      senderName: parsed.senderName,
      firstName: parsed.firstName ?? legacy?.firstName ?? null,
      lastName: parsed.lastName ?? legacy?.lastName ?? null,
      birthDate: parsed.birthDate ?? null,
      address: parsed.address ?? null,
      contactSource: parsed.contactSource,
      accountType: parsed.accountType ?? 'owner',
    };
  } catch {
    return null;
  }
}

/** Writes `value`, or removes the key when `value` is null. Storage trouble never breaks the screen. */
function writeKey(storage: SendFlowStorage | undefined, key: string, value: string | null): void {
  if (!storage) {
    return;
  }
  try {
    if (value === null) {
      storage.removeItem(key);
    } else {
      storage.setItem(key, value);
    }
  } catch {
    // The cache is a convenience; losing it must never break the screen.
  }
}

/** The cache only counts when it belongs to the user the signed-in marker names. */
function readOwnCache(storage: SendFlowStorage | undefined): CachedProfile | null {
  const cache = readCache(storage);
  if (!cache || !storage) {
    return null;
  }
  try {
    return cache.id === storage.getItem(SIGNED_IN_STORAGE_KEY) ? cache : null;
  } catch {
    return null;
  }
}

function toCached(profile: CachedProfile): CachedProfile {
  return {
    id: profile.id,
    senderName: profile.senderName,
    // An older gateway may omit these; never keep undefined.
    firstName: profile.firstName ?? null,
    lastName: profile.lastName ?? null,
    birthDate: profile.birthDate ?? null,
    address: profile.address ?? null,
    contactSource: profile.contactSource,
    // An older gateway may not send accountType yet; never keep undefined.
    accountType: profile.accountType === 'member' ? 'member' : 'owner',
  };
}

/** Which message a failed profile call shows. A 429 on a save gets its own copy, not the sign-in one. */
function profileFailureKey(reason: string): string {
  if (reason === 'signed_out') {
    return 'unavailable';
  }
  return reason === 'rate_limited' ? 'profile_rate_limited' : reason;
}

/**
 * Account state over any sign-in provider. Sign-up, sign-in and password reset belong to the
 * provider; this hook only reads who is signed in, keeps the profile, and signs out.
 */
export function useAccount({ auth, storage }: UseAccountOptions): UseAccountResult {
  const [offline, setOffline] = useState(false);
  const [profile, setProfile] = useState<CachedProfile | null>(() => readOwnCache(storage));
  const [profileAnswered, setProfileAnswered] = useState(() => readOwnCache(storage) !== null);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [profileLoadFailed, setProfileLoadFailed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Bumped by reloadProfile; the profile effect runs again.
  const [reloadTick, setReloadTick] = useState(0);
  // Set by signOut so the screen leaves the signed-in state before the provider answers.
  const [endedHere, setEndedHere] = useState(false);
  const mounted = useRef(true);
  const authRef = useRef(auth);
  authRef.current = auth;
  const storageRef = useRef(storage);
  // Bumped by anything that decides state (a new session, sign-out, a profile edit). A slower,
  // older request compares its captured value and drops its result instead of overwriting newer state.
  const gen = useRef(0);
  // The gen value of the current sign-in (-1 when none). A save bumps gen, so a first load can be "superseded"
  // yet still belong to this sign-in; this tells those apart from a load that belongs to an older one.
  const session = useRef(-1);
  // True once a save from this sign-in has returned the stored profile, which is newer than any first load.
  const savedInSession = useRef(false);

  const keepProfile = useCallback((next: CachedProfile | null) => {
    writeKey(storageRef.current, PROFILE_STORAGE_KEY, next ? JSON.stringify(next) : null);
    setProfile(next);
    // A save can supersede the first load; the server has still answered for this user.
    setProfileAnswered(true);
  }, []);

  const clearLocal = useCallback(() => {
    gen.current += 1;
    session.current = -1;
    writeKey(storageRef.current, PROFILE_STORAGE_KEY, null);
    writeKey(storageRef.current, SIGNED_IN_STORAGE_KEY, null);
    setProfile(null);
    setProfileAnswered(false);
    setProfileLoaded(false);
    setProfileLoadFailed(false);
    setOffline(false);
    setError(null);
  }, []);

  const fail = useCallback((reason: string) => {
    if (mounted.current) {
      setError(identityErrorMessage(reason));
    }
  }, []);

  /**
   * Runs a profile call with a token. On a 401 it asks for a fresh token and retries once. A second
   * 401 comes back as `signed_out` for the caller to report; it never ends the session (the provider
   * owns that). A token that cannot be had offline comes back as `offline` (C5).
   */
  const callWithToken = useCallback(
    async (g: number, call: (token: string) => Promise<ProfileResult>): Promise<ProfileResult> => {
      const first = await authRef.current.getToken();
      if (!first.ok) {
        return { ok: false, reason: first.reason };
      }
      const result = await call(first.token);
      if (result.ok || result.reason !== 'signed_out') {
        return result;
      }
      // Superseded while waiting: skip the retry, the caller drops this.
      if (g !== gen.current) {
        return result;
      }
      const fresh = await authRef.current.getToken({ forceRefresh: true });
      if (!fresh.ok) {
        return { ok: false, reason: fresh.reason };
      }
      return call(fresh.token);
    },
    [],
  );

  const authStatus = auth.status;
  const authUserId = auth.userId;
  const authSettled = auth.settled !== false;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (authStatus === 'loading') {
      return;
    }
    if (authStatus === 'signed_out' || authUserId === null) {
      clearLocal();
      setEndedHere(false);
      return;
    }
    const g = ++gen.current;
    session.current = g;
    savedInSession.current = false;
    writeKey(storageRef.current, SIGNED_IN_STORAGE_KEY, authUserId);
    // A cache written for another account must not show here.
    const stored = readCache(storageRef.current);
    if (stored && stored.id !== authUserId) {
      writeKey(storageRef.current, PROFILE_STORAGE_KEY, null);
    }
    setProfile((current) => (current && current.id !== authUserId ? null : current));
    // A cached profile for this user counts as an answer; otherwise the first server answer is still to come.
    setProfileAnswered(stored !== null && stored.id === authUserId);
    setProfileLoaded(false);
    setProfileLoadFailed(false);
    // The provider cannot give a token yet; asking now would read as offline. This runs again when it settles.
    if (!authSettled) {
      return;
    }
    void (async () => {
      const result = await callWithToken(g, (token) => getProfile(token));
      if (!mounted.current) {
        return;
      }
      // A save made during this load bumps gen. That must not leave profileLoaded false for good, so a
      // superseded load of this same sign-in still counts when it answered with a profile or "no profile".
      const superseded = g !== gen.current;
      if (superseded && (session.current !== g || !(result.ok || result.reason === 'no_profile'))) {
        return;
      }
      // Any answer, even a failure, ends the wait: a failed load must not lock the person out of saving.
      setProfileAnswered(true);
      setProfileLoadFailed(!(result.ok || result.reason === 'no_profile'));
      if (result.ok) {
        setOffline(false);
        if (!savedInSession.current) {
          keepProfile(toCached(result.profile));
        }
        setProfileLoaded(true);
      } else if (result.reason === 'offline') {
        setOffline(true);
      } else if (result.reason === 'no_profile') {
        setOffline(false);
        if (!savedInSession.current) {
          keepProfile(null);
        }
        setProfileLoaded(true);
      } else if (result.reason === 'signed_out') {
        setOffline(false);
        fail('unavailable');
      }
      // unavailable / invalid / failed: keep what we have, stay signed in.
    })();
  }, [authStatus, authUserId, authSettled, reloadTick, callWithToken, clearLocal, keepProfile, fail]);

  /**
   * Local state is cleared first and stays cleared even if `auth.signOut()` rejects: on a shared
   * phone the device must not stay signed in. Adapters must end their local session even offline.
   */
  const signOut = useCallback(async () => {
    // Local state first, so signing out never waits on the network.
    clearLocal();
    setEndedHere(true);
    try {
      await authRef.current.signOut();
    } catch {
      // Already signed out on this device; a failed server call must not show the person an error.
    }
  }, [clearLocal]);

  const updateSenderName = useCallback(
    async (name: string) => {
      setError(null);
      const g = ++gen.current;
      const result = await callWithToken(g, (token) => updateProfile(token, { senderName: name }));
      // A superseded call sets no error and changes nothing; it reports only whether the server saved it.
      if (!mounted.current || g !== gen.current) {
        return result.ok;
      }
      if (result.ok) {
        setOffline(false);
        savedInSession.current = true;
        keepProfile(toCached(result.profile));
        setProfileLoaded(true);
        return true;
      }
      if (result.reason === 'offline') {
        setOffline(true);
      }
      fail(profileFailureKey(result.reason));
      return false;
    },
    [callWithToken, keepProfile, fail],
  );

  const updateDetails = useCallback(
    async (details: ProfileDetails, options?: UpdateDetailsOptions): Promise<ProfileDetailsResult> => {
      const quiet = options?.quiet === true;
      if (!quiet) {
        setError(null);
      }
      const g = ++gen.current;
      const result = await callWithToken(g, (token) => updateProfile(token, details));
      if (!mounted.current || g !== gen.current) {
        return result.ok ? { ok: true } : { ok: false, invalid: result.reason === 'invalid' };
      }
      if (result.ok) {
        setOffline(false);
        savedInSession.current = true;
        keepProfile(toCached(result.profile));
        // The server returned the whole stored profile, so it counts as loaded.
        setProfileLoaded(true);
        return { ok: true };
      }
      if (result.reason === 'invalid') {
        return { ok: false, invalid: true };
      }
      if (result.reason === 'offline') {
        setOffline(true);
      }
      if (!quiet) {
        fail(profileFailureKey(result.reason));
      }
      return { ok: false, invalid: false };
    },
    [callWithToken, keepProfile, fail],
  );

  const clearError = useCallback(() => setError(null), []);
  // The reload runs the profile effect again, which bumps gen. A save still in flight then has its result dropped here
  // (nothing is shown or cached for it); the server still stores it, and the reload's answer reads it back.
  const reloadProfile = useCallback(() => setReloadTick((tick) => tick + 1), []);

  const status: AccountAuthStatus = endedHere ? 'signed_out' : authStatus;

  return {
    status,
    isSignedIn: status === 'signed_in',
    isLoading: status === 'loading',
    userId: status === 'signed_in' ? authUserId : null,
    offline,
    profile,
    profileAnswered,
    profileLoaded,
    error,
    clearError,
    profileLoadFailed,
    reloadProfile,
    signOut,
    updateSenderName,
    updateDetails,
  };
}
