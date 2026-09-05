import { makeFunctionReference } from 'convex/server';

/**
 * Typed references to `apps/gateway/convex/sync.ts`'s functions, by string
 * path rather than importing `convex/_generated/api.js`. That generated file
 * lives outside `src/` (in the sibling `convex/` folder used by `npx convex
 * dev`), and this app's non-bundled esbuild config only compiles/copies
 * `src/**` — a relative import reaching outside it resolves fine against
 * the source tree (so `typecheck` never catches it) but breaks at runtime
 * once esbuild's output path restructures around that outside reference.
 * Referencing functions by name sidesteps the whole problem.
 */

// `type`, not `interface` — Convex's generic constraints check assignability
// to `Record<string, unknown>`, which (as with Supabase's client generics
// earlier) `interface` declarations fail in a way `type` object literals
// don't.
export type PullArgs = {
  cursor: number;
  limit?: number;
  devUserId?: string;
};
export type PullResult = {
  sessions: unknown[];
  cursor: number;
  hasMore: boolean;
};

export type PushOp = {
  opId: string;
  sessionId: string;
  type: 'session.upsert';
  patch: Record<string, unknown>;
  createdAt: number;
};
export type PushArgs = {
  deviceId: string;
  ops: PushOp[];
  devUserId?: string;
};
export type PushResult = {
  acks: { opId: string; seq: number; serverUpdatedAt: number }[];
};

export const syncPull = makeFunctionReference<'query', PullArgs, PullResult>('sync:pull');
export const syncPush = makeFunctionReference<'mutation', PushArgs, PushResult>('sync:push');
