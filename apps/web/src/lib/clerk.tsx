/**
 * The only place that maps Clerk to the app. `useClerkAuth` turns Clerk's `useAuth()` into the
 * `AccountAuth` seam (libs/shared), and `ClerkAccount` feeds it to `useAccount`. Loaded lazily and
 * only when AUTH_ENABLED is on (see authClient.ts).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ComponentProps, ReactNode } from 'react';
import { ClerkProvider, useAuth } from '@clerk/react';
import { enUS } from '@clerk/localizations';
import { SIGNED_IN_STORAGE_KEY, useAccount } from '@griever/hooks';
import type { AccountAuth, AccountTokenResult } from '@griever/shared';
import { hasSignedInMarker } from './authClient';
import type { ClerkAccountState } from './authClient';
import { SIGN_OUT_PENDING_KEY, markSignOutPending } from './removeFromDevice';

/** Clerk not loaded after this long: a device with the signed-in marker opens for local work. */
export const CLERK_GIVE_UP_MS = 6000;

const GENERIC_SIGN_IN_ERROR = "That didn't work. Please check what you typed and try again.";

/** Every sign-in failure Clerk words differently gets this one calm sentence (C7). */
const SIGN_IN_ERROR_KEYS = [
  'form_password_incorrect',
  'form_password_or_identifier_incorrect',
  'form_identifier_not_found',
  'form_code_incorrect',
  'ticket_invalid_code',
  'ticket_expired_code',
] as const;

function withoutExclamations<T>(value: T): T {
  if (typeof value === 'string') {
    return value.replace(/!/g, '.') as T;
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, withoutExclamations(inner)])) as T;
  }
  return value;
}

type Localization = NonNullable<ComponentProps<typeof ClerkProvider>['localization']>;

function buildLocalization(): Localization {
  const calm = withoutExclamations(enUS);
  const errors: Record<string, unknown> = { ...calm.unstable__errors };
  for (const key of SIGN_IN_ERROR_KEYS) {
    errors[key] = GENERIC_SIGN_IN_ERROR;
  }
  return { ...calm, unstable__errors: errors as Localization['unstable__errors'] };
}

/** Clerk's en-US strings with no "!" and one generic sign-in error. */
export const localization: Localization = buildLocalization();

function pendingSignOut(): boolean {
  try {
    return window.localStorage.getItem(SIGN_OUT_PENDING_KEY) !== null;
  } catch {
    return false;
  }
}

function signedInMarker(): string | null {
  try {
    return window.localStorage.getItem(SIGNED_IN_STORAGE_KEY);
  } catch {
    return null;
  }
}

/**
 * `signed_out` only once Clerk has loaded and says there is no session. Until then: `loading`, or
 * with the signed-in marker and a Clerk that has not loaded in time (or an offline browser),
 * `signed_in` for local work (C5).
 */
export function useClerkAuth(): { auth: AccountAuth; unavailable: boolean } {
  const clerk = useAuth();
  const latest = useRef(clerk);
  latest.current = clerk;
  const { isLoaded, isSignedIn, userId } = clerk;

  const [gaveUp, setGaveUp] = useState(() => typeof navigator !== 'undefined' && navigator.onLine === false);
  useEffect(() => {
    if (isLoaded) {
      setGaveUp(false);
      return;
    }
    const timer = setTimeout(() => setGaveUp(true), CLERK_GIVE_UP_MS);
    const onOffline = () => setGaveUp(true);
    window.addEventListener('offline', onOffline);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('offline', onOffline);
    };
  }, [isLoaded]);

  // A sign-out that could not reach Clerk earlier is finished as soon as Clerk loads.
  const [finishing, setFinishing] = useState(pendingSignOut);
  useEffect(() => {
    if (!isLoaded || !finishing) {
      return;
    }
    let live = true;
    void latest.current
      .signOut()
      .then(() => {
        window.localStorage.removeItem(SIGN_OUT_PENDING_KEY);
      })
      .catch(() => {
        // Still pending; the next online load tries again.
      })
      .finally(() => {
        if (live) {
          setFinishing(false);
        }
      });
    return () => {
      live = false;
    };
  }, [isLoaded, finishing]);

  const marker = signedInMarker();
  let status: AccountAuth['status'] = 'loading';
  let currentUserId: string | null = null;
  if (finishing) {
    status = 'loading';
  } else if (isLoaded) {
    status = isSignedIn && userId ? 'signed_in' : 'signed_out';
    currentUserId = status === 'signed_in' ? (userId ?? null) : null;
  } else if (gaveUp && hasSignedInMarker()) {
    status = 'signed_in';
    currentUserId = marker;
  }
  const unavailable = !isLoaded && gaveUp && !hasSignedInMarker();

  const getToken = useCallback(async (options?: { forceRefresh?: boolean }): Promise<AccountTokenResult> => {
    const current = latest.current;
    if (!current.isLoaded) {
      return { ok: false, reason: 'offline' };
    }
    if (!current.isSignedIn) {
      return { ok: false, reason: 'signed_out' };
    }
    try {
      const token = await current.getToken(options?.forceRefresh ? { skipCache: true } : undefined);
      return token ? { ok: true, token } : { ok: false, reason: 'signed_out' };
    } catch {
      return { ok: false, reason: 'offline' };
    }
  }, []);

  /** Rejects when Clerk could not end the session; the pending flag finishes it on the next online load. */
  const signOut = useCallback(async () => {
    try {
      if (!latest.current.isLoaded) {
        throw new Error('Clerk is not loaded');
      }
      await latest.current.signOut();
    } catch (error) {
      markSignOutPending();
      throw error;
    }
  }, []);

  const auth = useMemo<AccountAuth>(
    () => ({ status, userId: currentUserId, getToken, signOut }),
    [status, currentUserId, getToken, signOut],
  );
  return { auth, unavailable };
}

const browserStorage = typeof window !== 'undefined' ? window.localStorage : undefined;

function AccountBridge({ children }: { children: (state: ClerkAccountState) => ReactNode }) {
  const { auth, unavailable } = useClerkAuth();
  const account = useAccount({ auth, storage: browserStorage });
  // `auth` is a new object when its status changes; the methods inside are stable.
  const { getToken, signOut } = auth;
  const getAccessToken = useCallback(async () => {
    const result = await getToken();
    return result.ok ? result.token : null;
  }, [getToken]);
  if (unavailable) {
    return <>{children({ unavailable: true })}</>;
  }
  return <>{children({ unavailable: false, account, getAccessToken, signOut })}</>;
}

// The app has no router: when Clerk wants to move the page after sign-in or sign-out, stay put and
// drop any leftover sign-in hash. The app reacts to the session itself.
function stayHere(): void {
  window.history.replaceState(null, '', window.location.pathname + window.location.search);
}

export function ClerkAccount({ children }: { children: (state: ClerkAccountState) => ReactNode }) {
  const publishableKey = String(import.meta.env['VITE_CLERK_PUBLISHABLE_KEY'] ?? '').trim();
  if (!publishableKey) {
    return <>{children({ unavailable: true })}</>;
  }
  return (
    <ClerkProvider
      publishableKey={publishableKey}
      localization={localization}
      routerPush={stayHere}
      routerReplace={stayHere}
      afterSignOutUrl="/"
    >
      <AccountBridge>{children}</AccountBridge>
    </ClerkProvider>
  );
}
