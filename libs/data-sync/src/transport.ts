import type { RemoteSessionRow } from "@griever/shared";

export interface PushOpInput {
  opId: string;
  sessionId: string;
  type: "session.upsert";
  patch: Record<string, unknown>;
  createdAt: number;
}

export interface PushAck {
  opId: string;
  seq: number;
  serverUpdatedAt: number;
}

/**
 * The seam between `libs/data-sync` and a backend. There is no real
 * implementation now: the gateway's `/sync/pull` and `/sync/push` routes were
 * removed with Convex (#203). Tests inject a fake.
 */
export interface SyncTransport {
  pull(args: { cursor: number; limit?: number }): Promise<{
    sessions: RemoteSessionRow[];
    cursor: number;
    hasMore: boolean;
  }>;
  push(args: { deviceId: string; ops: PushOpInput[] }): Promise<{ acks: PushAck[] }>;
}
