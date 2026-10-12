import { useCallback, useEffect, useRef, useState } from 'react';
import type { AccountContactSource, AccountType } from '@griever/shared';
import type { AuthClient, ProfileResult } from '@griever/api-client/auth';
import type { SendFlowStorage } from './useSendFlow.js';

export const PROFILE_STORAGE_KEY = 'gg.profile.v1';

/** The only profile fields kept on the device. No contact or message data. */
export interface CachedProfile {
  senderName: string | null;
  contactSource: AccountContactSource | null;
  /** Cached so an offline boot still hides "create" for members (C5). */
  accountType: AccountType;
}

/** What a reset step tells the person. `ok` says whether the step worked; `message` is always calm copy. */
export interface ResetOutcome {
  ok: boolean;
  message: string;
  /** True when the link is no good and only a new one will help. */
  expired?: boolean;
  /** True when this device is signed in as someone else and the link was not used. */
  differentAccount?: boolean;
  /** The account a good recovery link is for (from the link itself), when known. */
  email?: string | null;
}

export const RESET_REQUESTED_MESSAGE =
  "If that email has an account, we've sent a link to reset your password. It may take a few minutes.";
export const RESET_DONE_MESSAGE = "Your password is changed. You're signed in.";

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
  /** Asks for a reset link. The same words whether or not the email has an account. */
  requestReset: (email: string, redirectOrigin: string) => Promise<ResetOutcome>;
  /** Reads the recovery link in `url`. `ok: false` carries the reason in `message`. */
  openRecoveryLink: (url: string) => Promise<ResetOutcome>;
  /** Sets the new password; on success the account is signed in. */
  completeReset: (newPassword: string) => Promise<ResetOutcome>;
}

const MESSAGES = {
  email_taken: 'This email already has an account. Sign in instead.',
  invalid_credentials: "That email and password don't match. Please try again.",
  email_not_confirmed: 'Please check your email to finish setting up your account.',
  rate_limited: 'Too many tries. Please wait a few minutes and try again.',
  offline: "You need a connection to do this. Nothing you've typed is lost.",
  unavailable: "We can't reach your account right now. Please try again in a little while.",
  weak_password: 'Please choose a stronger password.',
  invalid_email: "That doesn't look like an email address. Please check it and try again.",
  different_account: 'This link is for a different account.',
  expired_link: 'That link has expired. You can ask for a new one.',
} as const;

/** Maps any failure reason from the auth client to calm copy (C7). */
export function identityErrorMessage(reason: string): string {
  return Object.hasOwn(MESSAGES, reason) ? MESSAGES[reason as keyof typeof MESSAGES] : MESSAGES.unavailable;
}

function isCachedProfile(value: unknown): value is CachedProfile {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const { senderName, contactSource, accountType } = value as Record<string, unknown>;
  return (
    (senderName === null || typeof senderName === 'string') &&
    (contactSource === null || contactSource === 'import' || contactSource === 'manual') &&
    (accountType === undefined || accountType === 'owner' || accountType === 'member')
  );
}

function readCache(storage: SendFlowStorage | undefined): CachedProfile | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(PROFILE_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    // A cache written before accountType existed reads as an owner.
    return isCachedProfile(parsed)
      ? { senderName: parsed.senderName, contactSource: parsed.contactSource, accountType: parsed.accountType ?? 'owner' }
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

function toCached(profile: CachedProfile): CachedProfile {
  return { senderName: profile.senderName, contactSource: profile.contactSource, accountType: profile.accountType };
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

  const requestReset = useCallback(async (email: string, redirectOrigin: string): Promise<ResetOutcome> => {
    const result = await clientRef.current.requestPasswordReset(email, redirectOrigin);
    return result.ok
      ? { ok: true, message: RESET_REQUESTED_MESSAGE }
      : { ok: false, message: identityErrorMessage(result.reason) };
  }, []);

  const openRecoveryLink = useCallback(async (url: string): Promise<ResetOutcome> => {
    const result = await clientRef.current.consumeRecoveryFromUrl(url);
    if (result.ok) return { ok: true, message: '', email: result.email };
    if (result.reason === 'different_account') {
      return { ok: false, message: identityErrorMessage(result.reason), differentAccount: true };
    }
    // No link at all reads the same as a dead one: either way, ask for a new one.
    const expired = result.reason === 'no_recovery' || result.reason === 'expired_link';
    return { ok: false, message: identityErrorMessage(expired ? 'expired_link' : result.reason), expired };
  }, []);

  const completeReset = useCallback(
    async (newPassword: string): Promise<ResetOutcome> => {
      const result = await clientRef.current.completePasswordReset(newPassword);
      if (!result.ok) {
        return { ok: false, message: identityErrorMessage(result.reason), expired: result.reason === 'expired_link' };
      }
      // The recovery session is now a normal one: pick it up so the app sees a signed-in account.
      await checkSession();
      return { ok: true, message: RESET_DONE_MESSAGE };
    },
    [checkSession],
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
    requestReset,
    openRecoveryLink,
    completeReset,
  };
}
