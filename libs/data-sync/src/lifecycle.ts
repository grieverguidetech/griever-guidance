import { sessionStore } from "@griever/data-local";
import type { RemoteSessionRow } from "@griever/shared";
import type { SyncTransport } from "./transport.js";
import { flush } from "./cursorClient.js";
import { setActiveSessionId, type KeyValueStorage } from "./localStorageKeys.js";

export const SWAP_FLUSH_FAILED_COPY =
  "We couldn't back up what you were working on. Try again when you have signal.";

export const NON_OPENABLE_COPY =
  "This one was written on another phone. Bring your contacts across and you'll be able to open it.";

export interface SwapResult {
  ok: boolean;
  reason?: string;
}

/**
 * DATA.md §2's exact ordering: flush the resident session's outbox → confirm
 * the server has it → make the target resident → delete the old document.
 * Refuses (never partially swaps) if the flush fails — the caller decides
 * what "no current session" means for a fresh account (pass `null`, which
 * skips the flush step entirely since there's nothing to back up).
 */
export async function swapToSession(
  currentSessionId: string | null,
  targetRow: RemoteSessionRow,
  transport: SyncTransport,
  deviceId: string,
  storage?: KeyValueStorage,
): Promise<SwapResult> {
  if (currentSessionId) {
    try {
      await flush(transport, deviceId);
    } catch {
      return { ok: false, reason: SWAP_FLUSH_FAILED_COPY };
    }
  }

  await sessionStore.put(targetRow);
  setActiveSessionId(targetRow.sessionId, storage);
  if (currentSessionId && currentSessionId !== targetRow.sessionId) {
    await sessionStore.delete(currentSessionId);
  }
  return { ok: true };
}

/**
 * A pulled session may only become resident on a device that can resolve its
 * recipients (DATA.md §2's "a device with no contacts does not restore a
 * session"). Now confirmed broken as written: tasks/03-contacts.md §3 makes
 * `contactId` a local ULID — "nothing provider-shaped is retained" — so it
 * cannot match across devices at all, which contradicts DATA.md §8.4's
 * framing of this as an E.164-number-drift problem. As it stands, a session
 * pulled onto a second device with the *same* contacts re-imported (fresh
 * ids) will never resolve as openable by this function. Cross-device
 * recipient matching needs its own resolution — out of scope here — this
 * function is left correct for same-device continuity only until that
 * lands; do not paper over it with fuzzy matching.
 */
export function isSessionOpenable(
  row: Pick<RemoteSessionRow, "screens">,
  localContactIds: ReadonlySet<string>,
): boolean {
  const referenced = new Set<string>();
  for (const screen of Object.values(row.screens)) {
    const values = screen.values as Record<string, unknown> | undefined;
    for (const key of ["selectedContactIds", "hearsFirstIds"] as const) {
      const ids = values?.[key];
      if (Array.isArray(ids)) {
        for (const id of ids) if (typeof id === "string") referenced.add(id);
      }
    }
  }
  if (referenced.size === 0) return true; // nothing recorded yet to resolve
  for (const id of referenced) {
    if (!localContactIds.has(id)) return false;
  }
  return true;
}
