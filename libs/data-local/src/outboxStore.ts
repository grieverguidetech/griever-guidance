import { openDb, type OutboxOp } from "./db.js";

/**
 * Raw CRUD on the `outbox` store (DATA.md §1). The coalescing *policy* —
 * merging consecutive `session.upsert` ops for the same session so 200
 * keystrokes become one op (§4.3) — lives in `libs/data-sync`, built on top
 * of these primitives; this module just persists whatever it's given.
 */

export async function list(): Promise<OutboxOp[]> {
  const db = await openDb();
  return db.getAllFromIndex("outbox", "byCreatedAt");
}

export async function getLastForSession(sessionId: string): Promise<OutboxOp | undefined> {
  const db = await openDb();
  const ops = await db.getAllFromIndex("outbox", "bySessionId", sessionId);
  return ops[ops.length - 1];
}

/** Appends a brand-new op and returns its generated `opId`. */
export async function add(op: Omit<OutboxOp, "opId">): Promise<number> {
  const db = await openDb();
  return db.add("outbox", op as OutboxOp);
}

/** Overwrites an existing op in place (used by the coalescing merge). */
export async function update(op: OutboxOp): Promise<void> {
  const db = await openDb();
  await db.put("outbox", op);
}

export async function remove(opId: number): Promise<void> {
  const db = await openDb();
  await db.delete("outbox", opId);
}

export async function removeMany(opIds: number[]): Promise<void> {
  const db = await openDb();
  const tx = db.transaction("outbox", "readwrite");
  await Promise.all(opIds.map((id) => tx.store.delete(id)));
  await tx.done;
}

export const outboxStore = { list, getLastForSession, add, update, remove, removeMany };
