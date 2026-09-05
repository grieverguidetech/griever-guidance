import type { RemoteSessionRow } from "@griever/shared";
import type { SyncTransport, PushAck } from "../transport.js";

/**
 * A minimal in-memory reimplementation of `apps/web/convex/sync.ts`'s
 * pull/push contract (idempotency-by-opId, per-screen merge on push,
 * cursor-ordered pull) — a fake standing in for the real backend, not a
 * shared implementation of it (Convex functions can't run outside Convex).
 */
export function createFakeServer(now: () => number = () => Date.now()) {
  let seq = 0;
  const rows = new Map<string, RemoteSessionRow>();
  const ackCache = new Map<string, PushAck>();
  let pushCallCount = 0;
  let pullCallCount = 0;

  const transport: SyncTransport = {
    async pull({ cursor, limit = 100 }) {
      pullCallCount += 1;
      const sorted = [...rows.values()]
        .filter((r) => r.seq > cursor)
        .sort((a, b) => a.seq - b.seq);
      const hasMore = sorted.length > limit;
      const page = hasMore ? sorted.slice(0, limit) : sorted;
      return {
        sessions: page,
        cursor: page.length ? page[page.length - 1].seq : cursor,
        hasMore,
      };
    },

    async push({ deviceId, ops }) {
      pushCallCount += 1;
      const acks: PushAck[] = [];

      for (const op of ops) {
        const idKey = `${deviceId}:${op.opId}`;
        const cached = ackCache.get(idKey);
        if (cached) {
          acks.push(cached);
          continue;
        }

        const patch = op.patch as Partial<RemoteSessionRow> & {
          screens?: RemoteSessionRow["screens"];
        };
        const incomingScreens = patch.screens ?? {};
        const incomingUpdatedAt = Object.values(incomingScreens).reduce(
          (max, entry) => Math.max(max, entry.updatedAt),
          0,
        );
        const existing = rows.get(op.sessionId);

        seq += 1;
        let row: RemoteSessionRow;
        if (!existing) {
          row = {
            schemaVersion: patch.schemaVersion ?? 1,
            sessionId: op.sessionId,
            userId: "usr_test",
            createdAt: op.createdAt,
            updatedAt: incomingUpdatedAt || now(),
            lastOpenedAt: patch.lastOpenedAt ?? now(),
            status: patch.status ?? "in_progress",
            screens: incomingScreens,
            cursorScreen: patch.cursorScreen ?? null,
            personName: patch.personName ?? null,
            dateOfPassing: patch.dateOfPassing ?? null,
            seq,
            deletedAt: patch.deletedAt ?? null,
            deviceId,
          };
        } else {
          const mergedScreens = { ...existing.screens };
          for (const [key, incoming] of Object.entries(incomingScreens)) {
            const current = mergedScreens[key];
            if (!current || incoming.updatedAt > current.updatedAt) mergedScreens[key] = incoming;
          }
          const scalarsAreNewer = incomingUpdatedAt > existing.updatedAt;
          row = {
            ...existing,
            screens: mergedScreens,
            seq,
            deviceId,
            deletedAt: patch.deletedAt !== undefined ? patch.deletedAt : existing.deletedAt,
            ...(scalarsAreNewer
              ? {
                  updatedAt: incomingUpdatedAt,
                  status: patch.status ?? existing.status,
                  cursorScreen: patch.cursorScreen ?? existing.cursorScreen,
                  personName: patch.personName ?? existing.personName,
                  dateOfPassing: patch.dateOfPassing ?? existing.dateOfPassing,
                  lastOpenedAt: patch.lastOpenedAt ?? existing.lastOpenedAt,
                }
              : {}),
          };
        }
        rows.set(op.sessionId, row);
        const ack: PushAck = { opId: op.opId, seq, serverUpdatedAt: row.updatedAt };
        ackCache.set(idKey, ack);
        acks.push(ack);
      }

      return { acks };
    },
  };

  return {
    transport,
    seedRows(newRows: RemoteSessionRow[]) {
      for (const row of newRows) {
        seq = Math.max(seq, row.seq);
        rows.set(row.sessionId, row);
      }
    },
    getRow: (sessionId: string) => rows.get(sessionId),
    get pushCallCount() {
      return pushCallCount;
    },
    get pullCallCount() {
      return pullCallCount;
    },
  };
}

export function createFailingTransport(): SyncTransport {
  return {
    pull() {
      return Promise.reject(new Error("network unreachable"));
    },
    push() {
      return Promise.reject(new Error("network unreachable"));
    },
  };
}
