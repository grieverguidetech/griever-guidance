import { useCallback, useEffect, useRef, useState } from 'react';
import type { AuthProvider } from '@griever/shared';
import {
  getSession,
  oauthStartUrl as buildOAuthStartUrl,
  signInWithPassword as apiSignInWithPassword,
  signUpWithPassword as apiSignUpWithPassword,
  signOutRequest,
  type SessionIdentity,
} from '@griever/api-client';
import type { SendFlowStorage } from './useSendFlow.js';

const TOKEN_STORAGE_KEY = 'gg.identity.token.v1';

export interface UseIdentityResult {
  /** null while signed out, or before the initial `/auth/session` check resolves. */
  identity: SessionIdentity | null;
  isSignedIn: boolean;
  /** True only while checking a previously-stored token on boot — not on every request. */
  isLoading: boolean;
  error: string | null;
  clearError: () => void;
  oauthStartUrl: (provider: Extract<AuthProvider, 'facebook' | 'instagram'>, redirectTo: string) => string;
  /**
   * Reads a `#token=…&isNew=…` (or `#error=…`) fragment left by the OAuth
   * callback redirect. Returns true if it found and consumed one — the
   * caller (apps/web's app.tsx) is then responsible for clearing the actual
   * URL hash via `history.replaceState`, since that's a DOM concern this
   * platform-agnostic hook doesn't touch directly.
   */
  completeOAuthCallback: (hash: string) => boolean;
  signUpWithPassword: (input: { email: string; password: string; senderName: string }) => Promise<boolean>;
  signInWithPassword: (input: { email: string; password: string }) => Promise<boolean>;
  signOut: () => void;
}

function loadToken(storage: SendFlowStorage | undefined): string | null {
  if (!storage) return null;
  try {
    return storage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

function saveToken(storage: SendFlowStorage | undefined, token: string | null): void {
  if (!storage) return;
  try {
    if (token) storage.setItem(TOKEN_STORAGE_KEY, token);
    else storage.removeItem(TOKEN_STORAGE_KEY);
  } catch {
    // storage unavailable — the session still works for this tab's lifetime
  }
}

/**
 * Real sign-up/sign-in against `libs/identity` (via `libs/api-client`) —
 * Facebook, Instagram, and email/password. Replaces `useAccount`, which was
 * a client-only mock that never reached the gateway or Convex.
 */
export function useIdentity(storage?: SendFlowStorage): UseIdentityResult {
  const [token, setTokenState] = useState<string | null>(() => loadToken(storage));
  const [identity, setIdentity] = useState<SessionIdentity | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(() => loadToken(storage) !== null);
  const [error, setError] = useState<string | null>(null);
  // So the session-check effect below can tell "is the token I just checked
  // still the current one" apart from a stale response racing a sign-out.
  const currentTokenRef = useRef<string | null>(token);
  currentTokenRef.current = token;

  const setToken = useCallback(
    (next: string | null) => {
      setTokenState(next);
      saveToken(storage, next);
    },
    [storage],
  );

  useEffect(() => {
    if (!token) {
      setIdentity(null);
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    getSession(token)
      .then((result) => {
        if (cancelled) return;
        setIdentity(result);
      })
      .catch(() => {
        if (cancelled || currentTokenRef.current !== token) return;
        setToken(null);
        setIdentity(null);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token, setToken]);

  const completeOAuthCallback = useCallback(
    (hash: string): boolean => {
      const raw = hash.startsWith('#') ? hash.slice(1) : hash;
      if (!raw) return false;
      const params = new URLSearchParams(raw);
      if (params.get('error')) {
        setError("That sign-in didn't go through. Please try again.");
        return true;
      }
      const newToken = params.get('token');
      if (!newToken) return false;
      setError(null);
      setToken(newToken);
      return true;
    },
    [setToken],
  );

  const signUpWithPassword = useCallback<UseIdentityResult['signUpWithPassword']>(
    async (input) => {
      setError(null);
      try {
        const result = await apiSignUpWithPassword(input);
        setToken(result.token);
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not create an account.');
        return false;
      }
    },
    [setToken],
  );

  const signInWithPassword = useCallback<UseIdentityResult['signInWithPassword']>(
    async (input) => {
      setError(null);
      try {
        const result = await apiSignInWithPassword(input);
        setToken(result.token);
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Incorrect email or password.');
        return false;
      }
    },
    [setToken],
  );

  const signOut = useCallback(() => {
    setToken(null);
    setIdentity(null);
    void signOutRequest().catch(() => {
      // Stateless server-side — nothing to reconcile locally if this fails.
    });
  }, [setToken]);

  return {
    identity,
    isSignedIn: identity !== null,
    isLoading,
    error,
    clearError: () => setError(null),
    oauthStartUrl: buildOAuthStartUrl,
    completeOAuthCallback,
    signUpWithPassword,
    signInWithPassword,
    signOut,
  };
}
