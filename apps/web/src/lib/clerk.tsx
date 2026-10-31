/**
 * The only place that maps Clerk to the app. `useClerkAuth` turns Clerk's `useAuth()` into the
 * `AccountAuth` seam (libs/shared), and `ClerkAccount` feeds it to `useAccount`. Loaded lazily and
 * only when AUTH_ENABLED is on (see authClient.ts).
 */
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type { ComponentProps, ReactNode } from 'react';
import { ClerkProvider, useAuth, useClerk } from '@clerk/react';
import { enUS } from '@clerk/localizations';
import { SIGNED_IN_STORAGE_KEY, useAccount } from '@griever/hooks';
import type { AccountAuth, AccountTokenResult } from '@griever/shared';
import { hasSignedInMarker } from './authClient';
import type { ClerkAccountState } from './authClient';
import { SIGN_OUT_PENDING_KEY, markSignOutPending } from './removeFromDevice';

/** Clerk not loaded after this long: a device with the signed-in marker opens for local work. */
export const CLERK_GIVE_UP_MS = 6000;

const GENERIC_SIGN_IN_ERROR = "That didn't work. Please check what you typed and try again.";

/** A first visit and a return visit see the same words: nothing says "Welcome back". */
const SIGN_IN_TITLE = 'Sign in or create an account';
const SIGN_IN_SUBTITLE = 'It takes a minute.';

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
  return {
    ...calm,
    signIn: {
      ...calm.signIn,
      start: {
        ...calm.signIn?.start,
        title: SIGN_IN_TITLE,
        titleCombined: SIGN_IN_TITLE,
        subtitle: SIGN_IN_SUBTITLE,
        actionText: 'New here?',
        actionLink: 'Create an account',
      },
    },
    signUp: {
      ...calm.signUp,
      start: {
        ...calm.signUp?.start,
        title: SIGN_IN_TITLE,
        titleCombined: SIGN_IN_TITLE,
        subtitle: SIGN_IN_SUBTITLE,
        subtitleCombined: SIGN_IN_SUBTITLE,
      },
    },
    unstable__errors: errors as Localization['unstable__errors'],
  };
}

/** Clerk's en-US strings with no "!", first-visit-safe sign-in/sign-up copy, and one generic sign-in error. */
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
 * `signed_out` only when Clerk is `ready`, the browser is online and Clerk says there is no
 * session, or when a sign-out is pending on this device. Otherwise a device with the signed-in
 * marker is `signed_in` from the marker at once, without waiting for Clerk (C5), and is reconciled
 * when Clerk answers. With no marker the status is `loading`.
 */
export function useClerkAuth(): { auth: AccountAuth; unavailable: boolean } {
  const clerk = useAuth();
  const instance = useClerk();
  const latest = useRef(clerk);
  latest.current = clerk;
  const { isLoaded, isSignedIn, userId } = clerk;
  const ready = instance.status === 'ready';

  // Re-render when the flag or the connection changes underneath us.
  const [, bump] = useReducer((n: number) => n + 1, 0);
  const [online, setOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine !== false);
  const [gaveUp, setGaveUp] = useState(() => typeof navigator !== 'undefined' && navigator.onLine === false);
  useEffect(() => {
    const onOnline = () => setOnline(true);
    const onOffline = () => {
      setOnline(false);
      setGaveUp(true);
    };
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);
  useEffect(() => {
    if (isLoaded) {
      setGaveUp(false);
      return;
    }
    const timer = setTimeout(() => setGaveUp(true), CLERK_GIVE_UP_MS);
    return () => clearTimeout(timer);
  }, [isLoaded]);

  // A sign-out that could not reach Clerk earlier is retried whenever Clerk is loaded and we are online.
  const pending = pendingSignOut();
  const retrying = useRef(false);
  useEffect(() => {
    if (!pending || !isLoaded || !online || retrying.current) {
      return;
    }
    retrying.current = true;
    void latest.current
      .signOut()
      .then(() => {
        window.localStorage.removeItem(SIGN_OUT_PENDING_KEY);
      })
      .catch(() => {
        // Still pending; the next online event tries again.
      })
      .finally(() => {
        retrying.current = false;
        bump();
      });
  }, [pending, isLoaded, online]);

  const marker = signedInMarker();
  let status: AccountAuth['status'] = 'loading';
  let currentUserId: string | null = null;
  if (pending) {
    status = 'signed_out';
  } else if (isLoaded && ready && online) {
    status = isSignedIn && userId ? 'signed_in' : 'signed_out';
    currentUserId = status === 'signed_in' ? (userId ?? null) : null;
  } else if (isLoaded && isSignedIn && userId) {
    status = 'signed_in';
    currentUserId = userId;
  } else if (marker) {
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
      bump();
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

/**
 * Applies to every Clerk view. Colors are the computed-contrast fixes from the a11y review; sizes
 * give 44 px touch targets; animations are off for calm and reduced motion. Style objects, not
 * Tailwind classes: Tailwind does not see Clerk's markup.
 */
export const appearance = {
  variables: { colorDanger: '#aa0b56', colorRing: '#006786', colorMutedForeground: '#5e5d5c' },
  options: { animations: false },
  elements: {
    formFieldInput: { minHeight: 44, maxHeight: 'none' },
    formButtonPrimary: { minHeight: 44 },
    socialButtonsBlockButton: { minHeight: 44 },
    formFieldInputShowPasswordButton: { minWidth: 44, minHeight: 44 },
  },
} as const;

export function ClerkAccount({ children }: { children: (state: ClerkAccountState) => ReactNode }) {
  const publishableKey = String(import.meta.env['VITE_CLERK_PUBLISHABLE_KEY'] ?? '').trim();
  if (!publishableKey) {
    return <>{children({ unavailable: true })}</>;
  }
  return (
    <ClerkProvider
      publishableKey={publishableKey}
      localization={localization}
      appearance={appearance}
      routerPush={stayHere}
      routerReplace={stayHere}
      afterSignOutUrl="/"
    >
      <AccountBridge>{children}</AccountBridge>
    </ClerkProvider>
  );
}
