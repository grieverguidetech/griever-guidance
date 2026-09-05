import { outboxStore, recordServerTime } from "@griever/data-local";
import type { SyncTransport } from "./transport.js";
import { applyRemoteRows } from "./merge.js";
import { getSyncCursor, setSyncCursor, setLastSyncAt, type KeyValueStorage } from "./localStorageKeys.js";

export interface FlushResult {
  pushed: number;
}

/**
 * Push the outbox → drop acked ops → advance the cursor to the highest
 * returned `seq` (so this device's own writes don't come back down on the
 * next pull) — DATA.md §4.3. A no-op (not an error) when the outbox is empty.
 */
export async function flush(
  transport: SyncTransport,
  deviceId: string,
  storage?: KeyValueStorage,
): Promise<FlushResult> {
  const ops = await outboxStore.list();
  if (ops.length === 0) return { pushed: 0 };

  const { acks } = await transport.push({
    deviceId,
    ops: ops.map((op) => ({
      opId: String(op.opId),
      sessionId: op.sessionId,
      type: op.type,
      patch: op.patch,
      createdAt: op.createdAt,
    })),
  });

  await outboxStore.removeMany(ops.map((op) => op.opId));

  let maxSeq = getSyncCursor(storage);
  let maxServerTime = 0;
  for (const ack of acks) {
    if (ack.seq > maxSeq) maxSeq = ack.seq;
    if (ack.serverUpdatedAt > maxServerTime) maxServerTime = ack.serverUpdatedAt;
  }
  setSyncCursor(maxSeq, storage);
  if (maxServerTime > 0) await recordServerTime(maxServerTime);

  return { pushed: ops.length };
}

/**
 * Pulls until `hasMore` is false before treating the cursor as current
 * (§4.2). `cursor: 0` (the default once nothing has ever synced) triggers a
 * full resync.
 */
export async function pullLoop(transport: SyncTransport, storage?: KeyValueStorage): Promise<void> {
  let cursor = getSyncCursor(storage);
  let hasMore = true;
  while (hasMore) {
    const result = await transport.pull({ cursor, limit: 100 });
    await applyRemoteRows(result.sessions);
    cursor = result.cursor;
    hasMore = result.hasMore;
    setSyncCursor(cursor, storage);
  }
}

/** The full boot/trigger sequence: flush, then pull to catch up (§4.5's "App boot, online" row). */
export async function syncNow(
  transport: SyncTransport,
  deviceId: string,
  storage?: KeyValueStorage,
): Promise<void> {
  await flush(transport, deviceId, storage);
  await pullLoop(transport, storage);
  setLastSyncAt(Date.now(), storage);
}
