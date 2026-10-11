import AsyncStorage from '@react-native-async-storage/async-storage';
import type { SendFlowStorage } from '@griever/hooks';

export type DeviceCache = SendFlowStorage & { hydrate(): Promise<void> };

/**
 * `useSessions` reads its storage synchronously, but AsyncStorage is async. So this is a small
 * in-memory map filled from AsyncStorage once for the given keys, before the hook mounts, that
 * writes through to AsyncStorage afterwards (the same pattern as `createProfileCache`). Everything
 * is on the phone; nothing here touches the network (C5).
 */
export function createDeviceCache(keys: string[]): DeviceCache {
  const memory = new Map<string, string>();
  return {
    async hydrate() {
      await Promise.all(
        keys.map(async (key) => {
          try {
            const raw = await AsyncStorage.getItem(key);
            if (raw !== null) memory.set(key, raw);
          } catch {
            // Nothing readable is the same as nothing saved yet.
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
