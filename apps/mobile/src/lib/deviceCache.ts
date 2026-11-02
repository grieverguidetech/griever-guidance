import { useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { SendFlowStorage } from '@griever/hooks';

export type DeviceCache = SendFlowStorage & { hydrate(): Promise<void> };

/** A key to load, and whether its saved value must be JSON to count as readable. */
export type CacheKey = { key: string; json: boolean };

export const HYDRATE_TIMEOUT_MS = 3000;

// Whether this phone is keeping what we write. Each writer (a cache, the checklist) reports in; the
// phone is "not saving" while any writer is failing. A later good write clears that writer.
const failing = new Set<string>();
const listeners = new Set<() => void>();

/** Records that a writer's last save worked (`true`) or did not (`false`). */
export function reportPersisting(source: string, ok: boolean): void {
  const wasFailing = failing.has(source);
  if (ok === !wasFailing) {
    return;
  }
  if (ok) {
    failing.delete(source);
  } else {
    failing.add(source);
  }
  listeners.forEach((listener) => listener());
}

/** True unless a save has failed or a cache is memory-only. */
export function isPersisting(): boolean {
  return failing.size === 0;
}

export function subscribePersisting(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Re-renders when the phone starts or stops keeping saves. */
export function usePersisting(): boolean {
  return useSyncExternalStore(subscribePersisting, isPersisting, isPersisting);
}

/** For tests: forget every reported failure. */
export function resetPersisting(): void {
  failing.clear();
  listeners.forEach((listener) => listener());
}

let nextCacheId = 0;

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
  const source = `deviceCache:${nextCacheId++}`;
  const markMemoryOnly = (key: string) => {
    memoryOnly.add(key);
    reportPersisting(source, false);
  };
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
            markMemoryOnly(key);
          }
          unresolved.delete(key);
        }),
      );
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<void>((resolve) => {
        timer = setTimeout(() => {
          unresolved.forEach(markMemoryOnly);
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
      if (memoryOnly.size > 0) {
        return;
      }
      AsyncStorage.setItem(key, value).then(
        () => reportPersisting(source, true),
        () => reportPersisting(source, false),
      );
    },
    removeItem(key) {
      memory.delete(key);
      if (memoryOnly.size > 0) {
        return;
      }
      AsyncStorage.removeItem(key).then(
        () => reportPersisting(source, true),
        () => reportPersisting(source, false),
      );
    },
  };
}
