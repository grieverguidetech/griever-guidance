/**
 * A stand-in for lib/clerk.tsx in app-level tests: the real `useAccount` over a fake sign-in
 * provider, so the App's account wiring runs without Clerk or the network. The adapter itself is
 * tested in lib/clerk.spec.tsx.
 */
import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useAccount } from '@griever/hooks';
import type { AccountAuth } from '@griever/shared';
import type { ClerkAccountState, ClerkLoadResult } from './lib/authClient';

export interface FakeClerkOptions {
  /** Signed in as this user at load; omit for signed out. */
  userId?: string;
  getToken?: AccountAuth['getToken'];
  /** Runs before the fake session ends; a rejection is passed on and the session stays. */
  signOut?: () => Promise<void>;
}

export interface FakeClerk {
  load: ClerkLoadResult;
  /** What the sign-in screen's button does. */
  signIn: (userId: string) => void;
  /** The session ends somewhere else (another tab, an expired cookie). */
  endElsewhere: () => void;
}

/** The real adapter reports signed_out while a sign-out is pending; so does the fake. */
function pendingSignOut(): boolean {
  return window.localStorage.getItem('gg.signOutPending') !== null;
}

export function fakeClerk(options: FakeClerkOptions = {}): FakeClerk {
  let userId: string | null = options.userId ?? null;
  const listeners = new Set<() => void>();
  const setUser = (id: string | null) => {
    userId = id;
    listeners.forEach((listener) => listener());
  };

  function useUser(): string | null {
    const [, bump] = useState(0);
    useEffect(() => {
      const listener = () => bump((n) => n + 1);
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    }, []);
    return userId;
  }

  const getToken = options.getToken ?? (async () => ({ ok: true as const, token: 'tok' }));

  function ClerkAccount({ children }: { children: (state: ClerkAccountState) => ReactNode }) {
    const id = useUser();
    const signOut = useMemo(
      () => async () => {
        // Like Clerk: a sign-out that fails leaves the session in place.
        await options.signOut?.();
        setUser(null);
      },
      [],
    );
    const auth = useMemo<AccountAuth>(
      () => ({ status: id && !pendingSignOut() ? 'signed_in' : 'signed_out', userId: id && !pendingSignOut() ? id : null, getToken, signOut }),
      [id, signOut],
    );
    const account = useAccount({ auth, storage: window.localStorage });
    const getAccessToken = useMemo(
      () => async () => {
        const result = await getToken();
        return result.ok ? result.token : null;
      },
      [],
    );
    return <>{children({ unavailable: false, account, getAccessToken, signOut })}</>;
  }

  function SignInScreen() {
    return (
      <div>
        <h1>Grievers Guidance</h1>
        <button type="button" onClick={() => setUser('u1')}>
          Sign in with the test provider
        </button>
      </div>
    );
  }

  return {
    load: { available: true, ClerkAccount, SignInScreen },
    signIn: setUser,
    endElsewhere: () => setUser(null),
  };
}
