import AsyncStorage from '@react-native-async-storage/async-storage';
import type { SendFlowStorage } from '@griever/hooks';

export type DeviceCache = SendFlowStorage & { hydrate(): Promise<void> };

/** A key to load, and whether its saved value must be JSON to count as readable. */
export type CacheKey = { key: string; json: boolean };

export const HYDRATE_TIMEOUT_MS = 3000;

/**
 * `useSessions` reads its storage synchronously, but AsyncStorage is async. So this is a small
 * in-memory map filled from AsyncStorage once for the given keys, before the hook mounts, that
 * writes through to AsyncStorage afterwards (the same pattern as `createProfileCache`). Everything
 * is on the phone; nothing here touches the network (C5).
 *
 * Safety: "could not read" must never look like "nothing saved". If a read fails, times out, or
 * returns JSON that does not parse, the whole cache is memory-only for the rest of this run (one
 * bad key means the keys no longer agree): nothing saved on the phone is overwritten, so a later
 * launch can still read it.
 */
export function createDeviceCache(keys: CacheKey[]): DeviceCache {
  const memory = new Map<string, string>();
  const memoryOnly = new Set<string>();
  return {
    async hydrate() {
      const unresolved = new Set(keys.map((k) => k.key));
      const read = Promise.all(
        keys.map(async ({ key, json }) => {
          try {
            const raw = await AsyncStorage.getItem(key);
            if (!unresolved.has(key)) return; // timed out already; stay memory-only
            if (raw !== null) {
              memory.set(key, raw);
              if (json) JSON.parse(raw);
            }
          } catch {
            memoryOnly.add(key);
          }
          unresolved.delete(key);
        }),
      );
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<void>((resolve) => {
        timer = setTimeout(() => {
          unresolved.forEach((key) => memoryOnly.add(key));
          unresolved.clear();
          resolve();
        }, HYDRATE_TIMEOUT_MS);
      });
      await Promise.race([read, timeout]);
      clearTimeout(timer);
    },
    getItem: (key) => memory.get(key) ?? null,
    setItem(key, value) {
      memory.set(key, value);
      if (memoryOnly.size > 0) return;
      void AsyncStorage.setItem(key, value).catch(() => undefined);
    },
    removeItem(key) {
      memory.delete(key);
      if (memoryOnly.size > 0) return;
      void AsyncStorage.removeItem(key).catch(() => undefined);
    },
  };
}
