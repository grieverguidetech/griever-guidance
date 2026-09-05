import { sessionStore } from "@griever/data-local";
import { mergeSessionScreens, type RemoteSessionRow } from "@griever/shared";

/**
 * Applies one pulled row to local state. Soft-deleted rows (§4.2 — pull
 * always includes them) are deleted locally on sight; that's the entire
 * reason for soft deletes, since a hard delete is invisible to a cursor pull.
 *
 * A row that isn't resident locally is left alone — a fresh device only
 * makes a session resident via an explicit swap-in (see `lifecycle.ts`), not
 * automatically on pull (DATA.md §2: a device with no matching contacts
 * can't usefully open it anyway).
 */
export async function applyRemoteRow(row: RemoteSessionRow): Promise<void> {
  if (row.deletedAt !== null) {
    await sessionStore.delete(row.sessionId);
    return;
  }
  const local = await sessionStore.get(row.sessionId);
  if (!local) return;
  const merged = mergeSessionScreens(local, row);
  await sessionStore.put(merged);
}

export async function applyRemoteRows(rows: RemoteSessionRow[]): Promise<void> {
  for (const row of rows) {
    await applyRemoteRow(row);
  }
}
