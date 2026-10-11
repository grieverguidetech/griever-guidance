import { useCallback, useEffect, useRef, useState } from 'react';
import type { AccountContactSource } from '@griever/shared';
import type { AuthClient, ProfileResult } from '@griever/api-client/auth';
import type { SendFlowStorage } from './useSendFlow.js';

export const PROFILE_STORAGE_KEY = 'gg.profile.v1';

/** The only profile fields kept on the device. No contact or message data. */
export interface CachedProfile {
  senderName: string | null;
  contactSource: AccountContactSource | null;
}

export type IdentityStatus = 'loading' | 'signed_in' | 'signed_out';

export interface UseSupabaseIdentityOptions {
  /**
   * Read once at mount. Passing a new client object later does not re-run the boot check, so
   * create the client once (module scope or a ref), not on every render.
   */
  client: AuthClient;
  /** Read once at mount, like `client`; a later `storage` prop is ignored. */
  storage?: SendFlowStorage;
}

export interface UseSupabaseIdentityResult {
  status: IdentityStatus;
  isSignedIn: boolean;
  /** True only during the first session check on boot. */
  isLoading: boolean;
  /** True when signed in from the stored session but the network could not be reached. */
  offline: boolean;
  /** null when signed out, when no profile exists yet (normal), or before one is known. */
  profile: CachedProfile | null;
  error: string | null;
  clearError: () => void;
  signUp: (email: string, password: string) => Promise<boolean>;
  signIn: (email: string, password: string) => Promise<boolean>;
  signOut: () => Promise<void>;
  updateSenderName: (name: string) => Promise<boolean>;
}

const MESSAGES = {
  email_taken: 'This email already has an account. Sign in instead.',
  invalid_credentials: "That email and password don't match. Please try again.",
  email_not_confirmed: 'Please check your email to finish setting up your account.',
  rate_limited: 'Too many tries. Please wait a few minutes and try again.',
  offline: "You need a connection to do this. Nothing you've typed is lost.",
  unavailable: "We can't reach your account right now. Please try again in a little while.",
  weak_password: 'Please choose a stronger password.',
} as const;

/** Maps any failure reason from the auth client to calm copy (C7). */
export function identityErrorMessage(reason: string): string {
  return Object.hasOwn(MESSAGES, reason) ? MESSAGES[reason as keyof typeof MESSAGES] : MESSAGES.unavailable;
}

function isCachedProfile(value: unknown): value is CachedProfile {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const { senderName, contactSource } = value as Record<string, unknown>;
  return (
    (senderName === null || typeof senderName === 'string') &&
    (contactSource === null || contactSource === 'import' || contactSource === 'manual')
  );
}

function readCache(storage: SendFlowStorage | undefined): CachedProfile | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(PROFILE_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isCachedProfile(parsed)
      ? { senderName: parsed.senderName, contactSource: parsed.contactSource }
      : null;
  } catch {
    return null;
  }
}

function writeCache(storage: SendFlowStorage | undefined, profile: CachedProfile | null): void {
  if (!storage) return;
  try {
    if (profile) storage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile));
    else storage.removeItem(PROFILE_STORAGE_KEY);
  } catch {
    // The cache is a convenience; losing it must never break the screen.
  }
}

function toCached(profile: { senderName: string | null; contactSource: CachedProfile['contactSource'] }): CachedProfile {
  return { senderName: profile.senderName, contactSource: profile.contactSource };
}

export function useSupabaseIdentity({ client, storage }: UseSupabaseIdentityOptions): UseSupabaseIdentityResult {
  const [status, setStatus] = useState<IdentityStatus>('loading');
  const [offline, setOffline] = useState(false);
  const [profile, setProfile] = useState<CachedProfile | null>(() => readCache(storage));
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);
  const clientRef = useRef(client);
  const storageRef = useRef(storage);
  // Bumped by anything that decides state (boot, sign-out, a profile edit). A slower, older
  // request compares its captured value and drops its result instead of overwriting newer state.
  const gen = useRef(0);

  const clearAll = useCallback(() => {
    gen.current += 1;
    writeCache(storageRef.current, null);
    setProfile(null);
    setOffline(false);
    setStatus('signed_out');
  }, []);

  const keepProfile = useCallback((next: CachedProfile | null) => {
    writeCache(storageRef.current, next);
    setProfile(next);
  }, []);

  const fail = useCallback((reason: string) => {
    if (mounted.current) setError(identityErrorMessage(reason));
  }, []);

  /**
   * Runs a profile call. On `signed_out` (a 401) it refreshes the token once and retries once.
   * A refresh that cannot reach the network is reported as `offline`, never as signed out (C5).
   */
  const callWithRefresh = useCallback(async (g: number, call: () => Promise<ProfileResult>): Promise<ProfileResult> => {
    const first = await call();
    if (first.ok || first.reason !== 'signed_out') return first;
    // Superseded (for example by sign-out) while waiting: skip the refresh, the caller drops this.
    if (g !== gen.current) return first;
    const refreshed = await clientRef.current.refreshSession();
    if (refreshed.status === 'offline') return { ok: false, reason: 'offline' };
    if (refreshed.status === 'signed_out') return first;
    return call();
  }, []);

  /** The session is really gone: end it on the server in the background and clear this device. */
  const endSession = useCallback(() => {
    void clientRef.current.signOut();
    clearAll();
  }, [clearAll]);

  /** Does not bump `gen`, so only `checkSession` (which just did) may call it. */
  const refreshProfile = useCallback(async () => {
    const g = gen.current;
    const result = await callWithRefresh(g, () => clientRef.current.getProfile());
    if (!mounted.current || g !== gen.current) return;
    if (result.ok) {
      setOffline(false);
      keepProfile(toCached(result.profile));
    } else if (result.reason === 'signed_out') {
      endSession();
    } else if (result.reason === 'no_profile') {
      setOffline(false);
      keepProfile(null);
    } else if (result.reason === 'offline') {
      setOffline(true);
    }
    // unavailable / invalid / failed: keep what we have, stay signed in.
  }, [callWithRefresh, keepProfile, endSession]);

  const checkSession = useCallback(async () => {
    const g = ++gen.current;
    const state = await clientRef.current.getSession();
    if (!mounted.current || g !== gen.current) return;
    if (state.status === 'signed_out') {
      clearAll();
      return;
    }
    setStatus('signed_in');
    if (state.status === 'offline') {
      setOffline(true);
      return;
    }
    setOffline(false);
    void refreshProfile();
  }, [clearAll, refreshProfile]);

  useEffect(() => {
    mounted.current = true;
    void checkSession();
    return () => {
      mounted.current = false;
    };
  }, [checkSession]);

  const signUp = useCallback(
    async (email: string, password: string) => {
      setError(null);
      const result = await clientRef.current.signUp(email, password);
      if (!result.ok) {
        fail(result.reason);
        return false;
      }
      // With email confirmation on there is no session yet; this stays signed out.
      await checkSession();
      return true;
    },
    [fail, checkSession],
  );

  const signIn = useCallback(
    async (email: string, password: string) => {
      setError(null);
      const result = await clientRef.current.signIn(email, password);
      if (!result.ok) {
        fail(result.reason);
        return false;
      }
      await checkSession();
      return true;
    },
    [fail, checkSession],
  );

  const signOut = useCallback(async () => {
    // Local state first, so signing out never waits on the network.
    clearAll();
    await clientRef.current.signOut();
  }, [clearAll]);

  const updateSenderName = useCallback(
    async (name: string) => {
      setError(null);
      const g = ++gen.current;
      const result = await callWithRefresh(g, () => clientRef.current.updateProfile({ senderName: name }));
      // A superseded call sets no error and changes nothing; it reports only whether the server saved it.
      if (!mounted.current || g !== gen.current) return result.ok;
      if (result.ok) {
        keepProfile(toCached(result.profile));
        return true;
      }
      if (result.reason === 'signed_out') endSession();
      else fail(result.reason);
      return false;
    },
    [callWithRefresh, keepProfile, endSession, fail],
  );

  const clearError = useCallback(() => setError(null), []);

  return {
    status,
    isSignedIn: status === 'signed_in',
    isLoading: status === 'loading',
    offline,
    profile,
    error,
    clearError,
    signUp,
    signIn,
    signOut,
    updateSenderName,
  };
}
