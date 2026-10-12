import type { AuthClient } from '@griever/api-client/auth';

export type AuthClientResult = { available: true; client: AuthClient } | { available: false };

let loading: Promise<AuthClientResult> | null = null;

function readEnv(name: string): string {
  const value: unknown = import.meta.env[name];
  return typeof value === 'string' ? value.trim() : '';
}

async function create(): Promise<AuthClientResult> {
  const url = readEnv('VITE_SUPABASE_URL');
  const anonKey = readEnv('VITE_SUPABASE_ANON_KEY');
  if (!url || !anonKey) return { available: false };
  try {
    // A dynamic import so supabase-js is its own chunk. Nothing downloads it unless
    // AUTH_ENABLED is on and this is called.
    const { createAuthClient } = await import('@griever/api-client/auth');
    return { available: true, client: createAuthClient({ url, anonKey, storage: window.localStorage }) };
  } catch {
    return { available: false };
  }
}

/**
 * Loads the Supabase auth client once. `useSupabaseIdentity` reads its client only at mount, so
 * every caller must get this same object. Only call it when AUTH_ENABLED is on.
 */
export function loadAuthClient(): Promise<AuthClientResult> {
  loading ??= create().then((result) => {
    // A failed load (for example a dropped connection) may be tried again on the next mount.
    if (!result.available) loading = null;
    return result;
  });
  return loading;
}

/**
 * The key supabase-js stores a session under: `sb-<first label of the project host>-auth-token`
 * (SupabaseClient.ts, `defaultStorageKey`). Our client does not override it.
 */
function sessionKeyFor(url: string): string | null {
  try {
    return `sb-${new URL(url).hostname.split('.')[0]}-auth-token`;
  } catch {
    return null;
  }
}

function looksLikeSession(raw: string | null): boolean {
  if (!raw) return false;
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
    const token = (value as { refresh_token?: unknown }).refresh_token;
    return typeof token === 'string' && token !== '';
  } catch {
    return false;
  }
}

/**
 * True when a Supabase session is already saved on this device. Reads storage only, never the
 * network, so it works when the auth chunk or the env is unavailable. With no project URL (the
 * env is missing) the exact key is unknown, so any `sb-*-auth-token` entry counts.
 */
export function hasStoredSession(storageOverride?: Storage): boolean {
  try {
    const storage = storageOverride ?? globalThis.localStorage;
    if (!storage) return false;
    const key = sessionKeyFor(readEnv('VITE_SUPABASE_URL'));
    if (key) return looksLikeSession(storage.getItem(key));
    for (let i = 0; i < storage.length; i++) {
      const name = storage.key(i);
      if (name && /^sb-.+-auth-token$/.test(name) && looksLikeSession(storage.getItem(name))) return true;
    }
    return false;
  } catch {
    return false;
  }
}
