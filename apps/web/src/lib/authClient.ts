import type { ComponentType, ReactNode } from 'react';
import type { UseAccountResult } from '@griever/hooks';
import { SIGNED_IN_STORAGE_KEY } from '@griever/hooks';

/** What the signed-in app needs from the account provider. `signOut` rejects when Clerk could not be reached. */
export interface ClerkAccountReady {
  unavailable: false;
  account: UseAccountResult;
  getAccessToken: () => Promise<string | null>;
  signOut: () => Promise<void>;
}

/** `unavailable`: Clerk is missing a key or did not load in time, and there is no signed-in marker to fall back on. */
export type ClerkAccountState = ClerkAccountReady | { unavailable: true };

export interface ClerkModules {
  ClerkAccount: ComponentType<{ children: (state: ClerkAccountState) => ReactNode }>;
  SignInScreen: ComponentType;
}

export type ClerkLoadResult = ({ available: true } & ClerkModules) | { available: false };

let loading: Promise<ClerkLoadResult> | null = null;

async function create(): Promise<ClerkLoadResult> {
  try {
    // Dynamic imports so Clerk is its own chunk. Nothing downloads it unless AUTH_ENABLED is on
    // and this is called.
    const [account, signIn] = await Promise.all([import('./clerk'), import('../screens/SignIn')]);
    return { available: true, ClerkAccount: account.ClerkAccount, SignInScreen: signIn.SignInScreen };
  } catch {
    return { available: false };
  }
}

/**
 * Loads the Clerk modules once. Only call it when AUTH_ENABLED is on.
 */
export function loadClerk(): Promise<ClerkLoadResult> {
  loading ??= create().then((result) => {
    // A failed load (for example a dropped connection) may be tried again on the next mount.
    if (!result.available) {
      loading = null;
    }
    return result;
  });
  return loading;
}

/**
 * True when a signed-in marker (the user id, written by useAccount) is saved on this device. Reads
 * storage only, never the network, so it works when Clerk is unavailable. With a marker the app
 * opens for local work; without one it cannot tell who is signed in (C5).
 */
export function hasSignedInMarker(storageOverride?: Pick<Storage, 'getItem'>): boolean {
  try {
    const storage = storageOverride ?? globalThis.localStorage;
    return Boolean(storage?.getItem(SIGNED_IN_STORAGE_KEY));
  } catch {
    return false;
  }
}
