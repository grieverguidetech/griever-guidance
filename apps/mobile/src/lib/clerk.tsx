import { useState } from 'react';
import type { ReactNode } from 'react';
import { ClerkProvider, useAuth } from '@clerk/expo';
import { resourceCache } from '@clerk/expo/resource-cache';
import { tokenCache } from '@clerk/expo/token-cache';
import type { AccountAuth } from '@griever/shared';

// Dot access on purpose: Expo only inlines `process.env.EXPO_PUBLIC_*` when it is written this way.
export const CLERK_PUBLISHABLE_KEY = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;

/** The part of Clerk's `useAuth()` that the adapter reads. */
export interface ClerkAuthLike {
  isLoaded: boolean;
  isSignedIn: boolean | undefined;
  userId: string | null | undefined;
  sessionId: string | null | undefined;
  getToken(options?: { skipCache?: boolean }): Promise<string | null>;
  signOut(): Promise<void>;
}

/**
 * Maps Clerk to the shared `AccountAuth` seam. `signed_out` is reported only when Clerk has loaded
 * and says there is no session; a Clerk that is still loading (or cannot load offline) reads as
 * `loading`, so the profile cache is never wiped by a bad connection (C5).
 *
 * `endedSessionId` is the session this device signed out of. If Clerk's own sign-out call failed
 * offline, that session is still stored, but the app must treat it as ended.
 */
export function toAccountAuth(clerk: ClerkAuthLike, endedSessionId: string | null, markEnded: (sessionId: string | null) => void): AccountAuth {
  const ended = endedSessionId !== null && endedSessionId === clerk.sessionId;
  let status: AccountAuth['status'] = 'loading';
  if (clerk.isLoaded && (ended || clerk.isSignedIn === false)) {
    status = 'signed_out';
  } else if (clerk.isLoaded && clerk.isSignedIn && clerk.userId) {
    status = 'signed_in';
  }
  return {
    status,
    userId: status === 'signed_in' ? (clerk.userId ?? null) : null,
    async getToken(options) {
      if (status === 'signed_out') {
        return { ok: false, reason: 'signed_out' };
      }
      if (status === 'loading') {
        return { ok: false, reason: 'offline' };
      }
      try {
        const token = await clerk.getToken({ skipCache: options?.forceRefresh === true });
        return token ? { ok: true, token } : { ok: false, reason: 'signed_out' };
      } catch {
        // Any failure to get a token keeps the person signed in; only a null token means signed out.
        return { ok: false, reason: 'offline' };
      }
    },
    async signOut() {
      markEnded(clerk.sessionId ?? null);
      await clerk.signOut();
    },
  };
}

/** Call inside `<ClerkProvider>`. */
export function useClerkAccountAuth(): AccountAuth {
  const clerk = useAuth() as unknown as ClerkAuthLike;
  const [endedSessionId, setEndedSessionId] = useState<string | null>(null);
  return toAccountAuth(clerk, endedSessionId, setEndedSessionId);
}

/** The children render at once; Clerk loads behind them. */
export function ClerkBoundary({ publishableKey, children }: { publishableKey: string; children: ReactNode }) {
  return (
    <ClerkProvider publishableKey={publishableKey} tokenCache={tokenCache} __experimental_resourceCache={resourceCache}>
      {children}
    </ClerkProvider>
  );
}
