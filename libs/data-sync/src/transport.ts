import type { RemoteSessionRow } from "@griever/shared";
import type { ConvexClient } from "convex/browser";
import type { FunctionReference } from "convex/server";

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
 * The seam between `libs/data-sync` and the actual backend. Real usage wraps
 * the Convex client (`createConvexTransport`, below); tests inject a fake
 * instead — the whole point of keeping this as an interface rather than
 * importing `convex/_generated/api` directly from this lib (which would also
 * wrongly couple a lib to one app's generated code).
 */
export interface SyncTransport {
  pull(args: { cursor: number; limit?: number }): Promise<{
    sessions: RemoteSessionRow[];
    cursor: number;
    hasMore: boolean;
  }>;
  push(args: { deviceId: string; ops: PushOpInput[] }): Promise<{ acks: PushAck[] }>;
}

export interface SyncFunctionRefs {
  pull: FunctionReference<"query">;
  push: FunctionReference<"mutation">;
}

/**
 * Wraps a live `ConvexClient` (from `convex/browser`) into a `SyncTransport`.
 * `devUserId` stands in for the real auth token while the dev stub is active
 * (see `apps/web/convex/auth.ts`) — the caller supplies it (or omits it once
 * real auth lands, at which point this parameter goes away with it).
 */
export function createConvexTransport(
  client: ConvexClient,
  refs: SyncFunctionRefs,
  devUserId?: string,
): SyncTransport {
  return {
    pull: (args) =>
      client.query(refs.pull, { ...args, devUserId }) as ReturnType<SyncTransport["pull"]>,
    push: (args) =>
      client.mutation(refs.push, { ...args, devUserId }) as ReturnType<SyncTransport["push"]>,
  };
}
