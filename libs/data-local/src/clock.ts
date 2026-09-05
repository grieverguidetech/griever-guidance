import { openDb } from "./db.js";

/**
 * DATA.md §7 — the one function every store write goes through, never
 * `Date.now()` directly. A phone with a wrong date otherwise pins a stale
 * screen as newest forever: `updatedAt = max(now, lastKnownServerTime + 1)`.
 */
export async function clampedNow(): Promise<number> {
  const db = await openDb();
  const meta = await db.get("meta", "lastKnownServerTime");
  const lastKnownServerTime = typeof meta?.value === "number" ? meta.value : 0;
  return Math.max(Date.now(), lastKnownServerTime + 1);
}

/** Called with `serverUpdatedAt` on every push ack (DATA.md §4.4). */
export async function recordServerTime(serverUpdatedAt: number): Promise<void> {
  const db = await openDb();
  const meta = await db.get("meta", "lastKnownServerTime");
  const current = typeof meta?.value === "number" ? meta.value : 0;
  if (serverUpdatedAt > current) {
    await db.put("meta", { key: "lastKnownServerTime", value: serverUpdatedAt });
  }
}

/** Pure version for tests and for merge logic that already has a snapshot of `meta`. */
export function clampTimestamp(now: number, lastKnownServerTime: number): number {
  return Math.max(now, lastKnownServerTime + 1);
}
