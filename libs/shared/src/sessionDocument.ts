/**
 * The screen-keyed local session document (DATA.md §2) and its merge rule
 * (§4.4). Shared between the Convex functions (`apps/web/convex/`, which
 * apply this same merge server-side per the brief's step 4) and the client
 * sync engine (`libs/data-sync`), so the two can never drift.
 */

export type ScreenStatus = "pending" | "active" | "complete" | "seen" | "skipped";

/** Known screen ids (DATA.md §2's example document) — informational, not a closed set: an
 * unknown key must still pass through read/merge/write untouched (rule 5). */
export const KNOWN_SCREEN_KEYS = [
  "L3",
  "D5",
  "C1",
  "C2",
  "C3",
  "C4",
  "A2",
  "A3",
  "A4",
  "B1",
  "B2",
  "B3",
  "B4",
  "B5",
  "C5",
] as const;

export interface ScreenEntry {
  status: ScreenStatus;
  updatedAt: number;
  values?: Record<string, unknown>;
}

export type SessionScreens = Record<string, ScreenEntry>;

export type SessionStatus = "in_progress" | "sent" | "archived";

export interface SessionDocument {
  schemaVersion: number;
  sessionId: string;
  userId: string;
  createdAt: number;
  updatedAt: number;
  lastOpenedAt: number;
  status: SessionStatus;
  screens: SessionScreens;
  cursorScreen: string | null;
}

/** A `sessions` row as returned by Convex's `pull` (DATA.md §3/§4.2) — a `SessionDocument`
 * plus the server's sync envelope and the fields denormalized for the previous-sessions picker. */
export interface RemoteSessionRow extends SessionDocument {
  personName: string | null;
  dateOfPassing: string | null;
  seq: number;
  deletedAt: number | null;
  deviceId: string;
}

/**
 * Per-screen last-writer-wins, resolved on `screen.updatedAt`. Document-level
 * scalars (`status`, `cursorScreen`, `lastOpenedAt`) take the side with the
 * greater `session.updatedAt`. That is the entire merge (DATA.md §4.4) — no
 * vector clocks, no CRDT: the two writers are the same person, and the loser
 * of a merge is one screen's worth of values, never a whole document.
 */
export function mergeSessionScreens(
  local: SessionDocument,
  remote: SessionDocument,
): SessionDocument {
  const screens: SessionScreens = {};
  const keys = new Set([...Object.keys(local.screens), ...Object.keys(remote.screens)]);
  for (const key of keys) {
    const l = local.screens[key];
    const r = remote.screens[key];
    if (!l) screens[key] = r;
    else if (!r) screens[key] = l;
    else screens[key] = r.updatedAt > l.updatedAt ? r : l;
  }

  const scalarWinner = remote.updatedAt > local.updatedAt ? remote : local;
  return {
    schemaVersion: scalarWinner.schemaVersion,
    sessionId: scalarWinner.sessionId,
    userId: scalarWinner.userId,
    createdAt: local.createdAt,
    updatedAt: scalarWinner.updatedAt,
    lastOpenedAt: scalarWinner.lastOpenedAt,
    status: scalarWinner.status,
    cursorScreen: scalarWinner.cursorScreen,
    screens,
  };
}
