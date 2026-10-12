import { openDb } from "./db.js";

/**
 * Empties every IndexedDB store in one transaction, so it is all or nothing. The list comes from
 * the database itself, so a store added later is cleared too.
 * Local only: it never touches the network and deletes nothing on a server.
 * Used by "Remove everything from this device" (settings only, C9).
 */
export async function clearAllLocalData(): Promise<void> {
  const db = await openDb();
  const names = Array.from(db.objectStoreNames);
  if (names.length === 0) return;
  const tx = db.transaction(names, "readwrite");
  await Promise.all(names.map((name) => tx.objectStore(name).clear()));
  await tx.done;
}
