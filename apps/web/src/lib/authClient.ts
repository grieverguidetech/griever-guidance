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
