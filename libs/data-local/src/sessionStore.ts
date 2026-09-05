import type { SessionDocument, ScreenEntry } from "@griever/shared";
import { openDb } from "./db.js";
import { clampedNow } from "./clock.js";
import { migrateSession } from "./migrations.js";

const DEBOUNCE_MS = 250;

// In-memory writes not yet committed to IndexedDB, keyed by sessionId. A
// keystroke must never await a write (DATA.md §1) — `upsertScreen` resolves
// once this map is updated, and the actual `db.put` happens on a timer.
const pending = new Map<string, SessionDocument>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();

async function flush(sessionId: string): Promise<void> {
  const doc = pending.get(sessionId);
  if (!doc) return;
  pending.delete(sessionId);
  const timer = timers.get(sessionId);
  if (timer) {
    clearTimeout(timer);
    timers.delete(sessionId);
  }
  const db = await openDb();
  await db.put("sessions", doc);
}

function scheduleFlush(sessionId: string): void {
  const existing = timers.get(sessionId);
  if (existing) clearTimeout(existing);
  timers.set(
    sessionId,
    setTimeout(() => {
      void flush(sessionId);
    }, DEBOUNCE_MS),
  );
}

function flushAllSync(): void {
  for (const sessionId of [...pending.keys()]) {
    void flush(sessionId);
  }
}

let listenersRegistered = false;

/** A backgrounded tab must never lose a write (DATA.md §1). */
function ensureForceCommitListeners(): void {
  if (listenersRegistered || typeof document === "undefined") return;
  listenersRegistered = true;
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushAllSync();
  });
  if (typeof window !== "undefined") {
    window.addEventListener("pagehide", flushAllSync);
  }
  // Bfcache freeze — not universally supported, harmless where absent.
  document.addEventListener("freeze", flushAllSync as EventListener);
}

async function getCurrent(sessionId: string): Promise<SessionDocument | undefined> {
  if (pending.has(sessionId)) return pending.get(sessionId);
  const db = await openDb();
  const doc = await db.get("sessions", sessionId);
  return doc ? migrateSession(doc) : undefined;
}

/** The resident session document, or undefined if none by that id exists locally. */
export async function get(sessionId: string): Promise<SessionDocument | undefined> {
  return getCurrent(sessionId);
}

/**
 * Merges `patch` into one screen, bumping `screen.updatedAt` (clamped, §7)
 * and the session's own `updatedAt` high-water mark. Debounced 250ms; call
 * `flushNow` before anything that reads the committed IDB row directly
 * (e.g. handing off to the sync engine).
 */
export async function upsertScreen(
  sessionId: string,
  screenKey: string,
  patch: Partial<Pick<ScreenEntry, "status" | "values">>,
  /** Pass a pre-computed clamped timestamp so a caller that also writes the
   * matching outbox op (DATA.md §4.3: append before applying) uses the exact
   * same `updatedAt` in both places. Defaults to a fresh `clampedNow()`. */
  at?: number,
): Promise<SessionDocument> {
  ensureForceCommitListeners();
  const current = await getCurrent(sessionId);
  if (!current) throw new Error(`upsertScreen: no resident session "${sessionId}"`);

  const now = at ?? (await clampedNow());
  const existingScreen = current.screens[screenKey];
  const nextScreen: ScreenEntry = {
    status: patch.status ?? existingScreen?.status ?? "pending",
    updatedAt: now,
    values:
      patch.values !== undefined
        ? { ...existingScreen?.values, ...patch.values }
        : existingScreen?.values,
  };

  const next: SessionDocument = {
    ...current,
    screens: { ...current.screens, [screenKey]: nextScreen },
    updatedAt: now,
  };
  pending.set(sessionId, next);
  scheduleFlush(sessionId);
  return next;
}

/** What `Continue` resumes to (DATA.md §2 — "L2's one surviving idea"). */
export async function setCursorScreen(sessionId: string, cursorScreen: string | null): Promise<SessionDocument> {
  ensureForceCommitListeners();
  const current = await getCurrent(sessionId);
  if (!current) throw new Error(`setCursorScreen: no resident session "${sessionId}"`);
  const now = await clampedNow();
  const next: SessionDocument = { ...current, cursorScreen, updatedAt: now };
  pending.set(sessionId, next);
  scheduleFlush(sessionId);
  return next;
}

export async function setStatus(
  sessionId: string,
  status: SessionDocument["status"],
): Promise<SessionDocument> {
  ensureForceCommitListeners();
  const current = await getCurrent(sessionId);
  if (!current) throw new Error(`setStatus: no resident session "${sessionId}"`);
  const now = await clampedNow();
  const next: SessionDocument = { ...current, status, updatedAt: now };
  pending.set(sessionId, next);
  scheduleFlush(sessionId);
  return next;
}

/** Writes a full document immediately (hydration/create) — no debounce needed. */
export async function put(doc: SessionDocument): Promise<void> {
  const db = await openDb();
  await db.put("sessions", doc);
}

export async function remove(sessionId: string): Promise<void> {
  pending.delete(sessionId);
  const timer = timers.get(sessionId);
  if (timer) {
    clearTimeout(timer);
    timers.delete(sessionId);
  }
  const db = await openDb();
  await db.delete("sessions", sessionId);
}

/** Commits a pending debounced write immediately. No-op if nothing is pending. */
export async function flushNow(sessionId: string): Promise<void> {
  await flush(sessionId);
}

export const sessionStore = {
  get,
  upsertScreen,
  setStatus,
  setCursorScreen,
  put,
  delete: remove,
  flushNow,
};
