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

// DATA.md §1 — pointers and tiny scalars only, read synchronously at boot.
const KEYS = {
  userId: "gg.userId",
  activeSessionId: "gg.activeSessionId",
  syncCursor: "gg.syncCursor",
  authProvider: "gg.authProvider",
  lastSyncAt: "gg.lastSyncAt",
} as const;

export function getSyncCursor(storage: KeyValueStorage = defaultStorage()): number {
  const raw = storage.getItem(KEYS.syncCursor);
  return raw ? Number(raw) : 0;
}

export function setSyncCursor(cursor: number, storage: KeyValueStorage = defaultStorage()): void {
  storage.setItem(KEYS.syncCursor, String(cursor));
}

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

export function setLastSyncAt(at: number, storage: KeyValueStorage = defaultStorage()): void {
  storage.setItem(KEYS.lastSyncAt, String(at));
}

export function getLastSyncAt(storage: KeyValueStorage = defaultStorage()): number | null {
  const raw = storage.getItem(KEYS.lastSyncAt);
  return raw ? Number(raw) : null;
}
