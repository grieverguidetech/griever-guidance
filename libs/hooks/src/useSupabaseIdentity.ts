import { useCallback, useEffect, useRef, useState } from 'react';
import type { AccountContactSource } from '@griever/shared';
import type { AuthClient } from '@griever/api-client/auth';
import type { SendFlowStorage } from './useSendFlow.js';

export const PROFILE_STORAGE_KEY = 'gg.profile.v1';

/** The only profile fields kept on the device. No contact or message data. */
export interface CachedProfile {
  senderName: string | null;
  contactSource: AccountContactSource | null;
}

export type IdentityStatus = 'loading' | 'signed_in' | 'signed_out';

export interface UseSupabaseIdentityOptions {
  client: AuthClient;
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
  weak_password: 'Please choose a longer password.',
} as const;

/** Maps any failure reason from the auth client to calm copy (C7). */
export function identityErrorMessage(reason: string): string {
  return reason in MESSAGES ? MESSAGES[reason as keyof typeof MESSAGES] : MESSAGES.unavailable;
}

function readCache(storage: SendFlowStorage | undefined): CachedProfile | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(PROFILE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CachedProfile>;
    return { senderName: parsed.senderName ?? null, contactSource: parsed.contactSource ?? null };
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

export function useSupabaseIdentity({ client, storage }: UseSupabaseIdentityOptions): UseSupabaseIdentityResult {
  const [status, setStatus] = useState<IdentityStatus>('loading');
  const [offline, setOffline] = useState(false);
  const [profile, setProfile] = useState<CachedProfile | null>(() => readCache(storage));
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const clearAll = useCallback(() => {
    writeCache(storage, null);
    setProfile(null);
    setOffline(false);
    setStatus('signed_out');
  }, [storage]);

  const keepProfile = useCallback(
    (next: CachedProfile | null) => {
      writeCache(storage, next);
      setProfile(next);
    },
    [storage],
  );

  /** Refreshes the profile from the gateway. Only `signed_out` ends the session (C5). */
  const refreshProfile = useCallback(async () => {
    const result = await client.getProfile();
    if (!mounted.current) return;
    if (result.ok) {
      setOffline(false);
      keepProfile({ senderName: result.profile.senderName, contactSource: result.profile.contactSource });
    } else if (result.reason === 'signed_out') {
      clearAll();
    } else if (result.reason === 'no_profile') {
      setOffline(false);
      keepProfile(null);
    } else if (result.reason === 'offline') {
      setOffline(true);
    }
    // unavailable / invalid / failed: keep what we have, stay signed in.
  }, [client, keepProfile, clearAll]);

  const checkSession = useCallback(async () => {
    const state = await client.getSession();
    if (!mounted.current) return;
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
    await refreshProfile();
  }, [client, clearAll, refreshProfile]);

  useEffect(() => {
    void checkSession();
  }, [checkSession]);

  const signUp = useCallback(
    async (email: string, password: string) => {
      setError(null);
      const result = await client.signUp(email, password);
      if (!result.ok) {
        setError(identityErrorMessage(result.reason));
        return false;
      }
      // With email confirmation on there is no session yet; this stays signed out.
      await checkSession();
      return true;
    },
    [client, checkSession],
  );

  const signIn = useCallback(
    async (email: string, password: string) => {
      setError(null);
      const result = await client.signIn(email, password);
      if (!result.ok) {
        setError(identityErrorMessage(result.reason));
        return false;
      }
      await checkSession();
      return true;
    },
    [client, checkSession],
  );

  const signOut = useCallback(async () => {
    await client.signOut();
    if (mounted.current) clearAll();
  }, [client, clearAll]);

  const updateSenderName = useCallback(
    async (name: string) => {
      setError(null);
      const result = await client.updateProfile({ senderName: name });
      if (!mounted.current) return false;
      if (result.ok) {
        keepProfile({ senderName: result.profile.senderName, contactSource: result.profile.contactSource });
        return true;
      }
      if (result.reason === 'signed_out') clearAll();
      else setError(identityErrorMessage(result.reason));
      return false;
    },
    [client, keepProfile, clearAll],
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
