import { createClient, isAuthRetryableFetchError } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
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

/** Expected failures are values, never exceptions. `offline` is kept apart from auth errors. */
export type SignUpResult =
  | { ok: true; userId: string }
  | { ok: false; reason: 'email_taken' | 'weak_password' | 'offline' | 'failed' };

export type SignInResult =
  | { ok: true; userId: string }
  | { ok: false; reason: 'invalid_credentials' | 'offline' | 'failed' };

export type SignOutResult = { ok: true } | { ok: false; reason: 'offline' | 'failed' };

export interface AuthSession {
  userId: string;
  email: string | null;
  accessToken: string;
}

export type ProfileResult =
  | { ok: true; profile: Profile }
  | { ok: false; reason: 'signed_out' | 'offline' | 'failed' };

export interface AuthClient {
  signUp(email: string, password: string): Promise<SignUpResult>;
  signIn(email: string, password: string): Promise<SignInResult>;
  /** Ends this device's session only (`scope: 'local'`). */
  signOut(): Promise<SignOutResult>;
  getSession(): Promise<AuthSession | null>;
  getProfile(): Promise<ProfileResult>;
  updateProfile(update: ProfileUpdate): Promise<ProfileResult>;
}

type AuthFailure = { code?: string; status?: number; message?: string } | null | undefined;

// supabase-js reports a duplicate email as `user_already_exists` (422); older GoTrue builds used
// `email_exists`. Checked against @supabase/auth-js error-codes.d.ts, not memory.
const DUPLICATE_CODES = ['user_already_exists', 'email_exists'];

function isOffline(error: unknown): boolean {
  // supabase-js wraps fetch failures (no network, 502/503/504) as AuthRetryableFetchError.
  // A raw TypeError is what fetch itself throws when the network is down.
  return isAuthRetryableFetchError(error) || error instanceof TypeError;
}

function signUpFailure(error: AuthFailure): Extract<SignUpResult, { ok: false }> {
  if (isOffline(error)) return { ok: false, reason: 'offline' };
  if (error?.code && DUPLICATE_CODES.includes(error.code)) return { ok: false, reason: 'email_taken' };
  if (error?.code === 'weak_password') return { ok: false, reason: 'weak_password' };
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
export function createAuthClient(config: AuthClientConfig, client?: SupabaseClient): AuthClient {
  const supabase =
    client ??
    createClient(config.url, config.anonKey, {
      auth: { persistSession: true, storage: config.storage, detectSessionInUrl: false },
    });

  async function accessToken(): Promise<string | null> {
    try {
      const { data } = await supabase.auth.getSession();
      return data.session?.access_token ?? null;
    } catch {
      return null;
    }
  }

  async function profileCall(path: string, init?: RequestInit): Promise<ProfileResult> {
    const token = await accessToken();
    if (!token) return { ok: false, reason: 'signed_out' };
    try {
      // The gateway answers with the camelCase `Profile` from libs/shared.
      const profile = await apiFetch<Profile>(path, {
        ...init,
        headers: { Authorization: `Bearer ${token}` },
      });
      return { ok: true, profile };
    } catch (error) {
      if (error instanceof ApiError) {
        return { ok: false, reason: error.status === 401 ? 'signed_out' : 'failed' };
      }
      return { ok: false, reason: 'offline' };
    }
  }

  return {
    async signUp(email, password) {
      try {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) return signUpFailure(error);
        // With "Confirm email" on, Supabase hides duplicates by returning a user with no identities.
        if (data.user && data.user.identities?.length === 0) return { ok: false, reason: 'email_taken' };
        if (!data.user) return { ok: false, reason: 'failed' };
        return { ok: true, userId: data.user.id };
      } catch (error) {
        return signUpFailure(isOffline(error) ? (error as AuthFailure) : null);
      }
    },

    async signIn(email, password) {
      try {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (isOffline(error)) return { ok: false, reason: 'offline' };
        if (error) {
          // Wrong password, unknown email, unconfirmed email: one answer, so nothing leaks (C7).
          return { ok: false, reason: error.status && error.status >= 500 ? 'failed' : 'invalid_credentials' };
        }
        return { ok: true, userId: data.user.id };
      } catch (error) {
        return { ok: false, reason: isOffline(error) ? 'offline' : 'failed' };
      }
    },

    async signOut() {
      try {
        const { error } = await supabase.auth.signOut({ scope: 'local' });
        if (isOffline(error)) return { ok: false, reason: 'offline' };
        return error ? { ok: false, reason: 'failed' } : { ok: true };
      } catch (error) {
        return { ok: false, reason: isOffline(error) ? 'offline' : 'failed' };
      }
    },

    async getSession() {
      try {
        const { data } = await supabase.auth.getSession();
        const session = data.session;
        if (!session) return null;
        return { userId: session.user.id, email: session.user.email ?? null, accessToken: session.access_token };
      } catch {
        return null;
      }
    },

    getProfile: () => profileCall('/me/profile'),

    updateProfile: (update) => profileCall('/me/profile', { method: 'PUT', body: JSON.stringify(update) }),
  };
}
