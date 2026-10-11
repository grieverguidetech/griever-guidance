import { createClient, isAuthRetryableFetchError } from '@supabase/supabase-js';
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import type { Profile, ProfileUpdate } from '@griever/shared';
import { ApiError, apiFetch } from './client.js';

/** Where supabase-js keeps the session (localStorage on web, secure storage on mobile). */
export interface AuthStorage {
  getItem(key: string): string | null | Promise<string | null>;
  setItem(key: string, value: string): void | Promise<void>;
  removeItem(key: string): void | Promise<void>;
}

export interface AuthClientConfig {
  url: string;
  anonKey: string;
  storage: AuthStorage;
}

/**
 * Expected failures are values, never exceptions.
 * - `offline`: the request never reached a server (no network).
 * - `unavailable`: a server answered with 5xx (Supabase or the gateway is down).
 */
export type SignUpResult =
  | { ok: true; userId: string }
  | {
      ok: false;
      reason:
        | 'email_taken'
        | 'weak_password'
        | 'rate_limited'
        | 'offline'
        | 'unavailable'
        | 'failed';
    };

export type SignInResult =
  | { ok: true; userId: string }
  | {
      ok: false;
      reason:
        | 'invalid_credentials'
        | 'email_not_confirmed'
        | 'rate_limited'
        | 'offline'
        | 'unavailable'
        | 'failed';
    };

/** Local scope clears this device's session first, so signing out never fails for the user. */
export interface SignOutResult {
  ok: true;
  /** False when the server call failed (offline or error); the token stays valid there until it expires. */
  serverRevoked: boolean;
}

export interface AuthSession {
  userId: string;
  email: string | null;
  accessToken: string;
}

/** `offline` means the stored session could not be refreshed without a network: not the same as signed out. */
export type SessionState =
  | { status: 'signed_in'; session: AuthSession }
  | { status: 'signed_out' }
  | { status: 'offline' };

export type ProfileResult =
  | { ok: true; profile: Profile }
  | {
      ok: false;
      /** `no_profile` (404) is normal right after sign-up; `invalid` is a 400 from the gateway. */
      reason:
        | 'signed_out'
        | 'offline'
        | 'no_profile'
        | 'invalid'
        | 'unavailable'
        | 'failed';
    };

export interface AuthClient {
  signUp(email: string, password: string): Promise<SignUpResult>;
  signIn(email: string, password: string): Promise<SignInResult>;
  /** Ends this device's session only (`scope: 'local'`). */
  signOut(): Promise<SignOutResult>;
  getSession(): Promise<SessionState>;
  /** Forces a token refresh. `offline` covers no network and 5xx; only a rejected refresh is `signed_out`. */
  refreshSession(): Promise<SessionState>;
  getProfile(): Promise<ProfileResult>;
  updateProfile(update: ProfileUpdate): Promise<ProfileResult>;
}

type AuthFailure =
  | { code?: string; status?: number; message?: string }
  | null
  | undefined;

// supabase-js reports a duplicate email as `user_already_exists` (422); older GoTrue builds used
// `email_exists`. Checked against @supabase/auth-js error-codes.d.ts, not memory.
const DUPLICATE_CODES = ['user_already_exists', 'email_exists'];

// Only these mean "wrong email or password". Anything else must not be reported as that.
const BAD_CREDENTIAL_CODES = [
  'invalid_credentials',
  'user_not_found',
  'validation_failed',
  'email_address_invalid',
];

type Reachability = 'offline' | 'unavailable' | null;

/**
 * supabase-js wraps a fetch failure as AuthRetryableFetchError with status 0 (no network) and
 * wraps a 502/503/504 the same way with that status. A raw TypeError is what fetch itself throws.
 */
function reachability(error: unknown): Reachability {
  if (error instanceof TypeError) return 'offline';
  if (isAuthRetryableFetchError(error))
    return error.status === 0 ? 'offline' : 'unavailable';
  const status = (error as AuthFailure)?.status;
  return typeof status === 'number' && status >= 500 ? 'unavailable' : null;
}

function isRateLimited(error: AuthFailure): boolean {
  return error?.status === 429 || error?.code === 'over_request_rate_limit';
}

function signUpFailure(
  error: AuthFailure,
): Extract<SignUpResult, { ok: false }> {
  const unreachable = reachability(error);
  if (unreachable) return { ok: false, reason: unreachable };
  if (error?.code && DUPLICATE_CODES.includes(error.code))
    return { ok: false, reason: 'email_taken' };
  if (error?.code === 'weak_password')
    return { ok: false, reason: 'weak_password' };
  if (isRateLimited(error)) return { ok: false, reason: 'rate_limited' };
  return { ok: false, reason: 'failed' };
}

function signInFailure(
  error: AuthFailure,
): Extract<SignInResult, { ok: false }> {
  const unreachable = reachability(error);
  if (unreachable) return { ok: false, reason: unreachable };
  if (isRateLimited(error)) return { ok: false, reason: 'rate_limited' };
  // Wrong password, unknown email: one answer, so nothing leaks (C7).
  if (error?.code && BAD_CREDENTIAL_CODES.includes(error.code))
    return { ok: false, reason: 'invalid_credentials' };
  // Never tell someone with the right password that it is wrong.
  if (error?.code === 'email_not_confirmed')
    return { ok: false, reason: 'email_not_confirmed' };
  return { ok: false, reason: 'failed' };
}

/**
 * Wraps supabase-js auth. Only auth and the gateway `/me/profile` calls go over the network;
 * contact and message data never pass through here (C3, C4).
 *
 * Session handling: `persistSession` is on and `storage` is injected by the app. `autoRefreshToken`
 * is left at the supabase-js default (on); apps that run in the background should call
 * `client.auth.stopAutoRefresh()` themselves. Pass `client` only in tests.
 */
export function createAuthClient(
  config: AuthClientConfig,
  client?: SupabaseClient,
): AuthClient {
  const supabase =
    client ??
    createClient(config.url, config.anonKey, {
      auth: {
        persistSession: true,
        storage: config.storage,
        detectSessionInUrl: false,
      },
    });

  function toSignedIn(session: Session): SessionState {
    return {
      status: 'signed_in',
      session: {
        userId: session.user.id,
        email: session.user.email ?? null,
        accessToken: session.access_token,
      },
    };
  }

  async function readSession(): Promise<SessionState> {
    try {
      const { data, error } = await supabase.auth.getSession();
      if (data.session) return toSignedIn(data.session);
      // An expired session that could not refresh because there is no network is not "signed out".
      return error && reachability(error)
        ? { status: 'offline' }
        : { status: 'signed_out' };
    } catch (error) {
      return reachability(error)
        ? { status: 'offline' }
        : { status: 'signed_out' };
    }
  }

  async function profileCall(init?: RequestInit): Promise<ProfileResult> {
    const state = await readSession();
    if (state.status === 'offline') return { ok: false, reason: 'offline' };
    if (state.status === 'signed_out')
      return { ok: false, reason: 'signed_out' };
    try {
      // The gateway answers with the camelCase `Profile` from libs/shared.
      const profile = await apiFetch<Profile>('/me/profile', {
        ...init,
        headers: { Authorization: `Bearer ${state.session.accessToken}` },
      });
      return { ok: true, profile };
    } catch (error) {
      if (error instanceof ApiError)
        return { ok: false, reason: profileReason(error.status) };
      // Only a fetch TypeError is a network failure; a malformed 200 body (SyntaxError) is `failed`.
      return {
        ok: false,
        reason: error instanceof TypeError ? 'offline' : 'failed',
      };
    }
  }

  return {
    async signUp(email, password) {
      try {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) return signUpFailure(error);
        // With "Confirm email" on, Supabase hides duplicates by returning a user with no identities.
        if (data.user && data.user.identities?.length === 0)
          return { ok: false, reason: 'email_taken' };
        if (!data.user) return { ok: false, reason: 'failed' };
        return { ok: true, userId: data.user.id };
      } catch (error) {
        return signUpFailure(error as AuthFailure);
      }
    },

    async signIn(email, password) {
      try {
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) return signInFailure(error);
        return { ok: true, userId: data.user.id };
      } catch (error) {
        return signInFailure(error as AuthFailure);
      }
    },

    async signOut() {
      try {
        const { error } = await supabase.auth.signOut({ scope: 'local' });
        return { ok: true, serverRevoked: !error };
      } catch {
        return { ok: true, serverRevoked: false };
      }
    },

    getSession: readSession,

    async refreshSession() {
      try {
        const { data, error } = await supabase.auth.refreshSession();
        if (data.session) return toSignedIn(data.session);
        return error && reachability(error)
          ? { status: 'offline' }
          : { status: 'signed_out' };
      } catch (error) {
        return reachability(error)
          ? { status: 'offline' }
          : { status: 'signed_out' };
      }
    },

    getProfile: () => profileCall(),

    updateProfile: (update) =>
      profileCall({ method: 'PUT', body: JSON.stringify(update) }),
  };
}

function profileReason(
  status: number,
): Extract<ProfileResult, { ok: false }>['reason'] {
  if (status === 401) return 'signed_out';
  if (status === 404) return 'no_profile';
  if (status === 400) return 'invalid';
  if (status === 503) return 'unavailable';
  return 'failed';
}
