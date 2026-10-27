import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { ClerkProvider, useAuth, useClerk } from '@clerk/expo';
import { resourceCache } from '@clerk/expo/resource-cache';
import { tokenCache } from '@clerk/expo/token-cache';
import { SIGNED_IN_STORAGE_KEY } from '@griever/hooks';
import type { SendFlowStorage } from '@griever/hooks';
import type { AccountAuth } from '@griever/shared';
import { SIGN_OUT_PENDING_KEY } from './authStorage';

// Dot access on purpose: Expo only inlines `process.env.EXPO_PUBLIC_*` when it is written this way.
export const CLERK_PUBLISHABLE_KEY = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;

/** The part of Clerk's `useAuth()` that the adapter reads. */
export interface ClerkAuthLike {
  isLoaded: boolean;
  isSignedIn: boolean | undefined;
  userId: string | null | undefined;
  getToken(options?: { skipCache?: boolean }): Promise<string | null>;
}

export interface AdapterInputs {
  clerk: ClerkAuthLike;
  /** Clerk's `status` is `ready`. A loaded Clerk can still be `degraded` (resource-cache fallback), which confirms nothing. */
  ready: boolean;
  /** The profile cache has been read, so the two markers below can be trusted. */
  hydrated: boolean;
  /** A sign-out started on this device and not yet confirmed by Clerk. */
  signOutPending: boolean;
  /** The user id from the last signed-in session on this device. */
  marker: string | null;
  signOut(): Promise<void>;
  /** Clerk has not loaded after SETTLE_AFTER_MS (an offline cold start): stop waiting so the profile load can say offline. */
  waitedLong?: boolean;
}

/** Clerk reports a lost connection with the code `network_error`, or the fetch's own TypeError. */
function isNetworkError(error: unknown): boolean {
  if (error instanceof TypeError) {
    return true;
  }
  const code = (error as { code?: unknown } | null)?.code;
  return code === 'network_error';
}

/**
 * Maps Clerk to the shared `AccountAuth` seam (the same rules as the web adapter). `signed_out` only
 * when a sign-out is pending on this device, or Clerk is `ready` and says there is no session.
 * Otherwise a device with a signed-in marker is `signed_in` from the marker at once (C5), and is
 * reconciled when Clerk answers; with no marker the status is `loading`.
 */
export function toAccountAuth({ clerk, ready, hydrated, signOutPending, marker, signOut, waitedLong = false }: AdapterInputs): AccountAuth {
  let status: AccountAuth['status'] = 'loading';
  let userId: string | null = null;
  if (!hydrated) {
    status = 'loading';
  } else if (signOutPending) {
    status = 'signed_out';
  } else if (clerk.isLoaded && ready) {
    status = clerk.isSignedIn && clerk.userId ? 'signed_in' : clerk.isSignedIn ? 'loading' : 'signed_out';
    userId = status === 'signed_in' ? (clerk.userId ?? null) : null;
  } else if (clerk.isLoaded && clerk.isSignedIn && clerk.userId) {
    status = 'signed_in';
    userId = clerk.userId;
  } else if (marker) {
    status = 'signed_in';
    userId = marker;
  }
  return {
    status,
    userId,
    // A marker-based signed_in has no token source until Clerk has loaded; a load that never comes settles after a wait (#343).
    settled: clerk.isLoaded || waitedLong,
    async getToken(options) {
      if (status === 'signed_out') {
        return { ok: false, reason: 'signed_out' };
      }
      if (!clerk.isLoaded || (!clerk.isSignedIn && !ready)) {
        return { ok: false, reason: 'offline' };
      }
      if (!clerk.isSignedIn) {
        return { ok: false, reason: 'signed_out' };
      }
      try {
        const token = await clerk.getToken({ skipCache: options?.forceRefresh === true });
        return token ? { ok: true, token } : { ok: false, reason: 'signed_out' };
      } catch (error) {
        // Any failure to get a token keeps the person signed in; only a null token means signed out.
        // Only a network failure reads as offline; anything else is a plain failure (#343).
        return { ok: false, reason: isNetworkError(error) ? 'offline' : 'failed' };
      }
    },
    signOut,
  };
}

/** How long a never-loading Clerk is waited for before the profile load runs and reports offline. */
export const SETTLE_AFTER_MS = 8000;

/** Call inside `<ClerkProvider>`. `storage` is the hydrated profile cache. */
export function useClerkAccountAuth(storage: SendFlowStorage, hydrated: boolean): AccountAuth {
  const clerk = useAuth() as unknown as ClerkAuthLike & { signOut(): Promise<void> };
  const instance = useClerk();
  const ready = instance.status === 'ready';
  const latest = useRef(clerk);
  latest.current = clerk;
  const busy = useRef(false);
  const [waitedLong, setWaitedLong] = useState(false);
  useEffect(() => {
    if (clerk.isLoaded) {
      return;
    }
    const timer = setTimeout(() => setWaitedLong(true), SETTLE_AFTER_MS);
    return () => clearTimeout(timer);
  }, [clerk.isLoaded]);
  // The flag lives in storage; re-render when it changes.
  const [, bump] = useReducer((n: number) => n + 1, 0);
  const signOutPending = hydrated && storage.getItem(SIGN_OUT_PENDING_KEY) !== null;

  // A sign-out that could not finish earlier is retried once Clerk is ready.
  useEffect(() => {
    if (!signOutPending || !clerk.isLoaded || !ready || busy.current) {
      return;
    }
    busy.current = true;
    void (clerk.isSignedIn ? latest.current.signOut() : Promise.resolve())
      .then(() => storage.removeItem(SIGN_OUT_PENDING_KEY))
      .catch(() => undefined)
      .finally(() => {
        busy.current = false;
        bump();
      });
  }, [signOutPending, clerk.isLoaded, clerk.isSignedIn, ready, storage]);

  /** The flag is written first, so a crash or a failed offline call still ends the session here. Rejects when Clerk fails. */
  const signOut = useCallback(async () => {
    storage.setItem(SIGN_OUT_PENDING_KEY, '1');
    busy.current = true;
    bump();
    try {
      if (!latest.current.isLoaded) {
        throw new Error('Clerk is not loaded');
      }
      await latest.current.signOut();
      storage.removeItem(SIGN_OUT_PENDING_KEY);
    } finally {
      busy.current = false;
      bump();
    }
  }, [storage]);

  return toAccountAuth({
    clerk,
    ready,
    hydrated,
    signOutPending,
    marker: hydrated ? storage.getItem(SIGNED_IN_STORAGE_KEY) : null,
    signOut,
    waitedLong,
  });
}

/** The children render at once; Clerk loads behind them. */
export function ClerkBoundary({ publishableKey, children }: { publishableKey: string; children: ReactNode }) {
  return (
    <ClerkProvider publishableKey={publishableKey} tokenCache={tokenCache} __experimental_resourceCache={resourceCache}>
      {children}
    </ClerkProvider>
  );
}
