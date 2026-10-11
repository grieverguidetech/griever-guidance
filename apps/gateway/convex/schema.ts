import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// See DATA.md §3. Accounts live in Supabase (REQUIREMENTS.md §6); the former
// `identities` and `profiles` tables are removed (#37). `sessions.userId` is an
// opaque string owned by whoever authenticates the caller (convex/auth.ts).
// `counters` isn't in DATA.md's §3 code block, but §4.1/§4.3 depend on it (the
// sequence cursor and push's idempotency record).

const syncFields = {
  seq: v.number(), // server-assigned monotonic sequence — the sync cursor
  updatedAt: v.number(), // server clock, ms
  deletedAt: v.union(v.number(), v.null()), // soft delete; rows are never removed
  deviceId: v.string(), // which device last wrote (for diagnostics, not merge)
};

export default defineSchema({
  sessions: defineTable({
    sessionId: v.string(), // ULID from the device — the client owns id generation
    userId: v.string(), // opaque user id; no other user data is denormalized here
    schemaVersion: v.number(),
    status: v.union(v.literal("in_progress"), v.literal("sent"), v.literal("archived")),
    // the screen-keyed document, stored whole. v.any() is deliberate: the server does not
    // interpret screen contents, so screens can be added client-side without a server deploy.
    screens: v.any(),
    cursorScreen: v.union(v.string(), v.null()),
    // denormalized for the previous-sessions picker, so listing never reads `screens`
    personName: v.union(v.string(), v.null()),
    dateOfPassing: v.union(v.string(), v.null()),
    lastOpenedAt: v.number(),
    createdAt: v.number(),
    ...syncFields,
  })
    .index("by_sessionId", ["sessionId"])
    .index("by_user", ["userId", "lastOpenedAt"])
    .index("by_user_seq", ["userId", "seq"]), // ← the pull query's index

  // Not in DATA.md §3's code block, but required by §4.1 (the sequence) and
  // §4.3 (push's idempotency-by-opId record). One row per user.
  counters: defineTable({
    userId: v.string(),
    seq: v.number(),
    // Last 1000 applied push op ids for this user, oldest-first — a retry of
    // an already-applied op is detected here and no-opped (§4.3).
    appliedOpIds: v.array(v.string()),
  }).index("by_user", ["userId"]),
});
