import type { MutationCtx, QueryCtx } from "./_generated/server";

// convex/auth.ts — the one file the real provider replaces (DATA.md §6/§9).
//
// DATA.md describes the dev stub as reading a dev-only `x-gg-user` header.
// Convex `query`/`mutation` functions never see raw request headers, though —
// only their declared args do (raw `Request` access is an HTTP-action-only
// capability), and `pull` has to stay a `query` to keep Convex's reactive
// subscription path (§4.2: "same query, no second code path"). So the dev
// stub takes the same value as an explicit `devUserId` arg instead of a
// header. Both hard requirements DATA.md actually cares about still hold:
// every function calls `requireUser` and nothing else touches identity, and
// the stub cannot ship.

// Condition 2: it cannot ship. This is deliberately NOT a runtime check in
// this file — verified empirically that Convex bundles every deploy
// (including a plain local `npx convex dev`) with `NODE_ENV=production`, and
// a function's `process.env` at runtime only exposes vars explicitly set via
// `npx convex env set`. Neither gives this file a way to tell "real
// production deployment" apart from "local self-hosted dev" from the inside.
// The enforcement lives one layer out instead: `scripts/check-dev-auth.mjs`,
// run by the `convex:deploy` script (see root package.json), refuses to
// deploy if `GG_DEV_AUTH` is set on any target whose URL isn't a loopback
// address. `convex:dev` (local) is never gated — only a real deploy is.

// Condition 1: one seam. Every query and mutation in this app calls this and
// nothing else touches identity — swapping in the real provider is one file.
export async function requireUser(
  _ctx: QueryCtx | MutationCtx,
  args: { devUserId?: string },
): Promise<string> {
  if (process.env.GG_DEV_AUTH === "1") {
    if (!args.devUserId) {
      throw new Error("devUserId is required while GG_DEV_AUTH=1 (local dev only).");
    }
    return args.devUserId;
  }
  throw new Error("auth not configured");
}
