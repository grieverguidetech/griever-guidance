import AsyncStorage from '@react-native-async-storage/async-storage';
import { PROFILE_STORAGE_KEY, SIGNED_IN_STORAGE_KEY } from '@griever/hooks';
import type { SendFlowStorage } from '@griever/hooks';

/** Set before Clerk is asked to sign out and cleared when it has. Same key as web. */
export const SIGN_OUT_PENDING_KEY = 'gg.signOutPending';

// Read once at mount: the profile, the marker that says whose profile it is, and the unfinished sign-out flag.
const HYDRATED_KEYS = [PROFILE_STORAGE_KEY, SIGNED_IN_STORAGE_KEY, SIGN_OUT_PENDING_KEY];

/**
 * `useAccount` reads its profile cache synchronously, but AsyncStorage is async. So the cache is a
 * small in-memory map that is filled from AsyncStorage once, before the hook mounts, and writes
 * through to AsyncStorage afterwards. The cache holds only the sender name, contact source and
 * the signed-in user id (never tokens, contacts or messages). Clerk keeps its own tokens in
 * secure storage.
 */
export function createProfileCache(): SendFlowStorage & { hydrate(): Promise<void> } {
  const memory = new Map<string, string>();
  return {
    async hydrate() {
      await Promise.all(
        HYDRATED_KEYS.map(async (key) => {
          try {
            const raw = await AsyncStorage.getItem(key);
            if (raw !== null) {
              memory.set(key, raw);
            }
          } catch {
            // No cached profile is fine; the server copy is fetched after boot.
          }
        }),
      );
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
