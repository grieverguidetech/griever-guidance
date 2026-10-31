import { useCallback, useEffect, useRef, useState } from 'react';
import type { AccountAuth, AccountAuthStatus } from '@griever/shared';
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
  error: string | null;
  clearError: () => void;
  signOut: () => Promise<void>;
  updateSenderName: (name: string) => Promise<boolean>;
  /** Saves the optional full name and date of birth (null clears one). `invalid` means the server refused a value; no general error is set for it. */
  updateDetails: (details: ProfileDetails) => Promise<ProfileDetailsResult>;
}

export interface ProfileDetails {
  fullName: string | null;
  /** yyyy-mm-dd */
  birthDate: string | null;
}

export type ProfileDetailsResult = { ok: true } | { ok: false; invalid: boolean };

function isCachedProfile(value: unknown): value is CachedProfile {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const { id, senderName, fullName, birthDate, contactSource, accountType } = value as Record<string, unknown>;
  return (
    typeof id === 'string' &&
    (senderName === null || typeof senderName === 'string') &&
    // Caches from before these fields existed have neither; that still counts.
    (fullName === undefined || fullName === null || typeof fullName === 'string') &&
    (birthDate === undefined || birthDate === null || typeof birthDate === 'string') &&
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
    // A cache written before accountType existed reads as an owner.
    return isCachedProfile(parsed)
      ? {
          id: parsed.id,
          senderName: parsed.senderName,
          fullName: parsed.fullName ?? null,
          birthDate: parsed.birthDate ?? null,
          contactSource: parsed.contactSource,
          accountType: parsed.accountType ?? 'owner',
        }
      : null;
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
    fullName: profile.fullName ?? null,
    birthDate: profile.birthDate ?? null,
    contactSource: profile.contactSource,
    // An older gateway may not send accountType yet; never keep undefined.
    accountType: profile.accountType === 'member' ? 'member' : 'owner',
  };
}

/**
 * Account state over any sign-in provider. Sign-up, sign-in and password reset belong to the
 * provider; this hook only reads who is signed in, keeps the profile, and signs out.
 */
export function useAccount({ auth, storage }: UseAccountOptions): UseAccountResult {
  const [offline, setOffline] = useState(false);
  const [profile, setProfile] = useState<CachedProfile | null>(() => readOwnCache(storage));
  const [error, setError] = useState<string | null>(null);
  // Set by signOut so the screen leaves the signed-in state before the provider answers.
  const [endedHere, setEndedHere] = useState(false);
  const mounted = useRef(true);
  const authRef = useRef(auth);
  authRef.current = auth;
  const storageRef = useRef(storage);
  // Bumped by anything that decides state (a new session, sign-out, a profile edit). A slower,
  // older request compares its captured value and drops its result instead of overwriting newer state.
  const gen = useRef(0);

  const keepProfile = useCallback((next: CachedProfile | null) => {
    writeKey(storageRef.current, PROFILE_STORAGE_KEY, next ? JSON.stringify(next) : null);
    setProfile(next);
  }, []);

  const clearLocal = useCallback(() => {
    gen.current += 1;
    writeKey(storageRef.current, PROFILE_STORAGE_KEY, null);
    writeKey(storageRef.current, SIGNED_IN_STORAGE_KEY, null);
    setProfile(null);
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
    writeKey(storageRef.current, SIGNED_IN_STORAGE_KEY, authUserId);
    // A cache written for another account must not show here.
    const stored = readCache(storageRef.current);
    if (stored && stored.id !== authUserId) {
      writeKey(storageRef.current, PROFILE_STORAGE_KEY, null);
    }
    setProfile((current) => (current && current.id !== authUserId ? null : current));
    // The provider cannot give a token yet; asking now would read as offline. This runs again when it settles.
    if (!authSettled) {
      return;
    }
    void (async () => {
      const result = await callWithToken(g, (token) => getProfile(token));
      if (!mounted.current || g !== gen.current) {
        return;
      }
      if (result.ok) {
        setOffline(false);
        keepProfile(toCached(result.profile));
      } else if (result.reason === 'offline') {
        setOffline(true);
      } else if (result.reason === 'no_profile') {
        setOffline(false);
        keepProfile(null);
      } else if (result.reason === 'signed_out') {
        setOffline(false);
        fail('unavailable');
      }
      // unavailable / invalid / failed: keep what we have, stay signed in.
    })();
  }, [authStatus, authUserId, authSettled, callWithToken, clearLocal, keepProfile, fail]);

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
        keepProfile(toCached(result.profile));
        return true;
      }
      if (result.reason === 'offline') {
        setOffline(true);
      }
      fail(result.reason === 'signed_out' ? 'unavailable' : result.reason);
      return false;
    },
    [callWithToken, keepProfile, fail],
  );

  const updateDetails = useCallback(
    async (details: ProfileDetails): Promise<ProfileDetailsResult> => {
      setError(null);
      const g = ++gen.current;
      const result = await callWithToken(g, (token) => updateProfile(token, details));
      if (!mounted.current || g !== gen.current) {
        return result.ok ? { ok: true } : { ok: false, invalid: result.reason === 'invalid' };
      }
      if (result.ok) {
        setOffline(false);
        keepProfile(toCached(result.profile));
        return { ok: true };
      }
      if (result.reason === 'invalid') {
        return { ok: false, invalid: true };
      }
      if (result.reason === 'offline') {
        setOffline(true);
      }
      fail(result.reason === 'signed_out' ? 'unavailable' : result.reason);
      return { ok: false, invalid: false };
    },
    [callWithToken, keepProfile, fail],
  );

  const clearError = useCallback(() => setError(null), []);

  const status: AccountAuthStatus = endedHere ? 'signed_out' : authStatus;

  return {
    status,
    isSignedIn: status === 'signed_in',
    isLoading: status === 'loading',
    userId: status === 'signed_in' ? authUserId : null,
    offline,
    profile,
    error,
    clearError,
    signOut,
    updateSenderName,
    updateDetails,
  };
}
