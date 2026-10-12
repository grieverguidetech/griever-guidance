import { openDb } from "./db.js";

const STORES = ["sessions", "contacts", "outbox", "sendJobs", "account", "meta"] as const;

/**
 * Empties every IndexedDB store in one transaction, so it is all or nothing.
 * Local only: it never touches the network and deletes nothing on a server.
 * Used by "Remove everything from this device" (settings only, C9).
 */
export async function clearAllLocalData(): Promise<void> {
  const db = await openDb();
  const tx = db.transaction([...STORES], "readwrite");
  await Promise.all(STORES.map((name) => tx.objectStore(name).clear()));
  await tx.done;
}
