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
 * The seam between `libs/data-sync` and the backend. The only real
 * implementation is `createGatewayTransport` below — this lib never talks to
 * Convex directly (CLAUDE.md rule 2a: the gateway is the only thing that
 * does). Kept as an interface so tests inject a fake instead.
 */
export interface SyncTransport {
  pull(args: { cursor: number; limit?: number }): Promise<{
    sessions: RemoteSessionRow[];
    cursor: number;
    hasMore: boolean;
  }>;
  push(args: { deviceId: string; ops: PushOpInput[] }): Promise<{ acks: PushAck[] }>;
}

export interface GatewayTransportOptions {
  /** e.g. `VITE_API_URL` — the same base URL `libs/api-client` already uses. */
  baseUrl: string;
  /**
   * Sent as `x-gg-user` — this deployment's stand-in for real auth while the
   * dev stub is active (see `apps/gateway/convex/auth.ts`). Goes away with
   * the stub; the gateway is where this header is actually read, since a
   * plain HTTP server (unlike a Convex query/mutation) sees raw headers.
   */
  devUserId?: string;
  fetchImpl?: typeof fetch;
}

/** The only real transport: talks to `apps/gateway`'s `/sync/pull` and `/sync/push`. */
export function createGatewayTransport({
  baseUrl,
  devUserId,
  fetchImpl = fetch,
}: GatewayTransportOptions): SyncTransport {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (devUserId) headers["x-gg-user"] = devUserId;

  return {
    async pull({ cursor, limit }) {
      const params = new URLSearchParams({ cursor: String(cursor) });
      if (limit !== undefined) params.set("limit", String(limit));
      const res = await fetchImpl(`${baseUrl}/sync/pull?${params.toString()}`, { headers });
      if (!res.ok) throw new Error(`gateway pull failed: ${res.status}`);
      return res.json();
    },

    async push({ deviceId, ops }) {
      const res = await fetchImpl(`${baseUrl}/sync/push`, {
        method: "POST",
        headers,
        body: JSON.stringify({ deviceId, ops }),
        // DATA.md §4.5 — lets a push started right before the page is torn
        // down (pagehide) complete instead of being cancelled.
        keepalive: true,
      });
      if (!res.ok) throw new Error(`gateway push failed: ${res.status}`);
      return res.json();
    },
  };
}
