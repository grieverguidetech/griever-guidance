import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AuthStorage } from '@griever/api-client/auth';
import type { SendFlowStorage } from '@griever/hooks';

/**
 * Where supabase-js keeps the session. AsyncStorage is async, which supabase-js accepts.
 * Tokens here are NOT encrypted. That is an accepted trade-off (#24 G1); expo-secure-store is
 * the later option. Note for that switch: `readSession` in api-client maps an unknown storage
 * error to `signed_out`, so a secure-store failure would look like a sign-out.
 */
export const authStorage: AuthStorage = {
  getItem: (key) => AsyncStorage.getItem(key),
  setItem: (key, value) => AsyncStorage.setItem(key, value),
  removeItem: (key) => AsyncStorage.removeItem(key),
};

const PROFILE_KEY = 'gg.profile.v1';

/**
 * `useSupabaseIdentity` reads its profile cache synchronously, but AsyncStorage is async. So the
 * cache is a small in-memory map that is filled from AsyncStorage once, before the hook mounts,
 * and writes through to AsyncStorage afterwards. The cache holds only the sender name and
 * contact source (never tokens, contacts or messages).
 */
export function createProfileCache(): SendFlowStorage & { hydrate(): Promise<void> } {
  const memory = new Map<string, string>();
  return {
    async hydrate() {
      try {
        const raw = await AsyncStorage.getItem(PROFILE_KEY);
        if (raw !== null) memory.set(PROFILE_KEY, raw);
      } catch {
        // No cached profile is fine; the server copy is fetched after boot.
      }
    },
    getItem: (key) => memory.get(key) ?? null,
    setItem(key, value) {
      memory.set(key, value);
      void AsyncStorage.setItem(key, value).catch(() => undefined);
    },
    removeItem(key) {
      memory.delete(key);
      void AsyncStorage.removeItem(key).catch(() => undefined);
    },
  };
}
