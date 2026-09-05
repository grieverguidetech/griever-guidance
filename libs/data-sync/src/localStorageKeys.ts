/** Minimal storage seam — matches `libs/hooks`'s `SendFlowStorage` shape without depending on it. */
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function defaultStorage(): KeyValueStorage {
  if (typeof localStorage === "undefined") {
    throw new Error("No localStorage available — pass a KeyValueStorage explicitly (e.g. in tests).");
  }
  return localStorage;
}

/**
 * DATA.md §1 — pointers and tiny scalars, read synchronously at boot.
 * `syncCursor`/`lastSyncAt` are NOT here — they live in IndexedDB's `meta`
 * store (`@griever/data-local`'s `metaStore`) instead, because the Service
 * Worker needs to read and write them and has no `localStorage` access at
 * all. Only the main thread needs `activeSessionId`/`userId`, synchronously,
 * before first paint — so those stay here.
 */
const KEYS = {
  userId: "gg.userId",
  activeSessionId: "gg.activeSessionId",
  authProvider: "gg.authProvider",
} as const;

export function getActiveSessionId(storage: KeyValueStorage = defaultStorage()): string | null {
  return storage.getItem(KEYS.activeSessionId);
}

export function setActiveSessionId(
  sessionId: string | null,
  storage: KeyValueStorage = defaultStorage(),
): void {
  if (sessionId === null) storage.removeItem(KEYS.activeSessionId);
  else storage.setItem(KEYS.activeSessionId, sessionId);
}

export function getUserId(storage: KeyValueStorage = defaultStorage()): string | null {
  return storage.getItem(KEYS.userId);
}

export function setUserId(userId: string, storage: KeyValueStorage = defaultStorage()): void {
  storage.setItem(KEYS.userId, userId);
}
