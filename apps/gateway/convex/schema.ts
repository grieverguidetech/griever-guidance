import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// See DATA.md §3. Copied verbatim except for one addition: `counters`, which
// DATA.md's own §4.1/§4.3 text depends on (the sequence cursor and push's
// idempotency record) but which isn't shown in the §3 code block itself.

const syncFields = {
  seq: v.number(), // server-assigned monotonic sequence — the sync cursor
  updatedAt: v.number(), // server clock, ms
  deletedAt: v.union(v.number(), v.null()), // soft delete; rows are never removed
  deviceId: v.string(), // which device last wrote (for diagnostics, not merge)
};

export default defineSchema({
  users: defineTable({
    userId: v.string(), // "usr_…" — the app-level id; the only link to sessions
    authProvider: v.union(
      v.literal("google"),
      v.literal("facebook"),
      v.literal("x"),
      v.literal("password"),
    ),
    providerSub: v.string(), // provider subject / hashed email for password accounts
    email: v.union(v.string(), v.null()),
    emailVerified: v.boolean(), // recorded, NEVER gates anything (README D2)
    senderName: v.union(v.string(), v.null()),
    contactSource: v.union(v.literal("imported"), v.literal("manual")),
    checklistTicks: v.array(v.string()), // C3 item keys — account-level, carries across sessions (§2.1)
    createdAt: v.number(),
    ...syncFields,
  })
    .index("by_userId", ["userId"])
    .index("by_provider", ["authProvider", "providerSub"])
    .index("by_seq", ["seq"]),

  sessions: defineTable({
    sessionId: v.string(), // ULID from the device — the client owns id generation
    userId: v.string(), // the unique-ID binding; no other user data is denormalized here
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
