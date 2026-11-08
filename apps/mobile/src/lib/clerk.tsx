import { createContext, useCallback, useContext, useEffect, useReducer, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { ClerkProvider, useAuth, useClerk, useReverification, useUser } from '@clerk/expo';
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

/** Thrown by `deleteClerkAccount` when the person closed Clerk's verify step. Nothing was deleted. */
export class DeleteCancelledError extends Error {
  constructor(options?: { cause?: unknown }) {
    super('Account deletion was cancelled at the verification step');
    this.name = 'DeleteCancelledError';
    (this as { cause?: unknown }).cause = options?.cause;
  }
}

/**
 * Thrown by the bridge's `deleteAccount` when Clerk asked for a verify step. Clerk's native SDK has no screen
 * for it, so the step is cancelled and the person is told to sign in again first. Nothing was deleted.
 */
export class DeleteNeedsSignInError extends Error {
  constructor(options?: { cause?: unknown }) {
    super('Clerk needs a fresh sign-in before the account can be deleted');
    this.name = 'DeleteNeedsSignInError';
    (this as { cause?: unknown }).cause = options?.cause;
  }
}

/** The part of Clerk's user that deleting the account uses. */
export interface DeletableUser {
  delete(): Promise<unknown>;
}

/** Runs the delete. In the app this is `useReverification(...)`: Clerk asks for a verify step when it needs one, then retries once. */
export type RunDelete = (user: DeletableUser) => Promise<unknown>;

/** Clerk marks a closed verify step with this code (the same check as `isReverificationCancelledError`, which this app cannot import). */
function isVerifyCancelled(error: unknown): boolean {
  return (error as { code?: unknown } | null)?.code === 'reverification_cancelled';
}

/**
 * Deletes the signed-in Clerk user, as web does. Rejects when there is no user or Clerk refuses (offline,
 * deletion not enabled), and with `DeleteCancelledError` when the person closes the verify step.
 * Clerk ends the session itself when the user is deleted.
 */
export async function deleteClerkAccount(user: DeletableUser | null | undefined, run: RunDelete = (target) => target.delete()): Promise<void> {
  if (!user) {
    throw new Error('No signed-in user');
  }
  let result: unknown;
  try {
    result = await run(user);
  } catch (error) {
    if (isVerifyCancelled(error)) {
      throw new DeleteCancelledError({ cause: error });
    }
    throw error;
  }
  // After its one retry the wrapper resolves with a hint when Clerk still wants verification.
  if (typeof result === 'object' && result !== null && 'clerk_error' in result) {
    throw new Error('Clerk still needs verification before the account can be deleted');
  }
}

/** What Your account shows about the sign-in: the email (read-only) and Clerk's hosted account page. Both null until Clerk has them. */
export interface SignInInfo {
  email: string | null;
  /** An https address for Clerk's account management page. Null when there is none, and Manage sign-in is not shown. */
  manageUrl: string | null;
  /** Deletes the signed-in account. Null until Clerk has loaded a user, and Delete account is not shown. */
  deleteAccount: (() => Promise<void>) | null;
}

const NO_SIGN_IN_INFO: SignInInfo = { email: null, manageUrl: null, deleteAccount: null };
const SignInInfoContext = createContext<SignInInfo>(NO_SIGN_IN_INFO);

/** Reads Clerk's signed-in email and account page. Empty outside Clerk (accounts off). */
export function useSignInInfo(): SignInInfo {
  return useContext(SignInInfoContext);
}

/** Only an https address is ever opened. */
function httpsOrNull(url: string | null | undefined): string | null {
  return url && url.startsWith('https://') ? url : null;
}

function SignInInfoBridge({ children }: { children: ReactNode }) {
  const { user } = useUser();
  const instance = useClerk();
  const email = user?.primaryEmailAddress?.emailAddress ?? null;
  // Clerk's hosted account page (the account portal). Asked for only once Clerk has loaded and a person is signed in.
  const manageUrl = email && instance.loaded ? safeProfileUrl(instance) : null;
  // Clerk's native SDK has no verify screen. When it asks for one, cancel it and say what to do instead.
  const askedToVerify = useRef(false);
  const runDelete = useReverification((target: DeletableUser) => target.delete(), {
    onNeedsReverification: ({ cancel }: { cancel: () => void }) => {
      askedToVerify.current = true;
      cancel();
    },
  }) as unknown as RunDelete;
  const deleteAccount = useCallback(async () => {
    askedToVerify.current = false;
    try {
      await deleteClerkAccount(user, runDelete);
    } catch (error) {
      throw askedToVerify.current && error instanceof DeleteCancelledError ? new DeleteNeedsSignInError({ cause: error }) : error;
    }
  }, [user, runDelete]);
  const canDelete = !!user && instance.loaded;
  return <SignInInfoContext.Provider value={{ email, manageUrl, deleteAccount: canDelete ? deleteAccount : null }}>{children}</SignInInfoContext.Provider>;
}

function safeProfileUrl(instance: { buildUserProfileUrl?: () => string }): string | null {
  try {
    return httpsOrNull(instance.buildUserProfileUrl?.());
  } catch {
    return null;
  }
}

/** The children render at once; Clerk loads behind them. */
export function ClerkBoundary({ publishableKey, children }: { publishableKey: string; children: ReactNode }) {
  return (
    <ClerkProvider publishableKey={publishableKey} tokenCache={tokenCache} __experimental_resourceCache={resourceCache}>
      <SignInInfoBridge>{children}</SignInInfoBridge>
    </ClerkProvider>
  );
}
