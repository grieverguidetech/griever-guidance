import { createAuthClient } from '@griever/api-client/auth';
import type { AuthClient } from '@griever/api-client/auth';
import { authStorage } from './authStorage';

export interface AuthEnv {
  url: string | undefined;
  anonKey: string | undefined;
}

/** Returns null (accounts unavailable) when the env is missing or the client cannot be built. */
export function createMobileAuthClient({ url, anonKey }: AuthEnv): AuthClient | null {
  if (!url || !anonKey) return null;
  try {
    return createAuthClient({ url, anonKey, storage: authStorage });
  } catch {
    return null;
  }
}

// One client for the whole app. Dot access: Expo only inlines `process.env.EXPO_PUBLIC_*` this way.
export const authClient: AuthClient | null = createMobileAuthClient({
  url: process.env.EXPO_PUBLIC_SUPABASE_URL,
  anonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
});
