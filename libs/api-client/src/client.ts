import type { AccountContactSource, AuthProvider, ObituaryRequest, ObituaryResponse } from '@griever/shared';

declare const __VITE_API_URL__: string | undefined;

function getBaseUrl(): string {
  if (typeof process !== 'undefined' && process.env['EXPO_PUBLIC_API_URL']) {
    return process.env['EXPO_PUBLIC_API_URL'];
  }
  try {
    const viteUrl = (import.meta as { env?: Record<string, string> }).env?.['VITE_API_URL'];
    if (viteUrl) return viteUrl;
  } catch {
    // not in a Vite context
  }
  return 'http://localhost:3001';
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${getBaseUrl()}${path}`, {
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    ...init,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    let message = text || res.statusText;
    try {
      const parsed = JSON.parse(text) as { error?: string };
      if (parsed.error) message = parsed.error;
    } catch {
      // body wasn't JSON — fall back to the raw text/status above
    }
    throw new Error(message);
  }
  return res.json() as Promise<T>;
}

export function generateObituary(payload: ObituaryRequest): Promise<ObituaryResponse> {
  return apiFetch<ObituaryResponse>('/obituary', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

// ---- Identity (libs/identity, mounted by apps/gateway) ----

export interface SessionIdentity {
  userId: string;
  authProvider: AuthProvider;
  email: string | null;
  emailVerified: boolean;
  senderName: string | null;
  contactSource: AccountContactSource;
  checklistTicks: string[];
}

export interface PasswordAuthResult {
  token: string;
  userId: string;
  isNewIdentity: boolean;
}

/**
 * Builds the URL to send the browser to for Facebook/Instagram sign-up —
 * navigating there (a real page redirect, not a fetch) is the caller's job.
 * `redirectTo` must match the gateway's `CORS_ORIGINS` allowlist or
 * `/auth/:provider/start` refuses it (see libs/identity/src/router.ts).
 */
export function oauthStartUrl(provider: Extract<AuthProvider, 'facebook' | 'instagram'>, redirectTo: string): string {
  return `${getBaseUrl()}/auth/${provider}/start?redirectTo=${encodeURIComponent(redirectTo)}`;
}

export function signUpWithPassword(input: {
  email: string;
  password: string;
  senderName: string;
}): Promise<PasswordAuthResult> {
  return apiFetch<PasswordAuthResult>('/auth/password/signup', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function signInWithPassword(input: { email: string; password: string }): Promise<PasswordAuthResult> {
  return apiFetch<PasswordAuthResult>('/auth/password/signin', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function getSession(token: string): Promise<SessionIdentity> {
  return apiFetch<SessionIdentity>('/auth/session', {
    headers: { Authorization: `Bearer ${token}` },
  });
}

/** The session is a stateless bearer token — this just tells the gateway (for symmetry/future
 * revocation); the client's own job is discarding its stored token regardless of the response. */
export function signOutRequest(): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>('/auth/signout', { method: 'POST' });
}
