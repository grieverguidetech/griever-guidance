import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// See DATA.md §3, with one deliberate departure from the original code block:
// identity and profile are two tables, not one. `identities` is *only* what
// proves who signed in (provider, provider subject, email) — the "identity"
// lib (libs/identity) is the one thing in this repo that ever writes to it.
// `profiles` is the app-level state that used to sit on the same row
// (senderName, contactSource, checklistTicks) — it outlives no differently
// than before, it just isn't identity data. Both are keyed by the same
// `userId`; `profiles.userId` is a foreign key onto `identities.userId`, and
// `sessions.userId` (unchanged) is a second foreign key onto the same value.
// `counters` is the other addition: DATA.md's own §4.1/§4.3 text depends on
// it (the sequence cursor and push's idempotency record) but it isn't shown
// in the §3 code block itself.

const syncFields = {
  seq: v.number(), // server-assigned monotonic sequence — the sync cursor
  updatedAt: v.number(), // server clock, ms
  deletedAt: v.union(v.number(), v.null()), // soft delete; rows are never removed
  deviceId: v.string(), // which device last wrote (for diagnostics, not merge)
};

export default defineSchema({
  // Who signed in. Nothing app-facing lives here — no sender name, no
  // contact source, no checklist state. Only `libs/identity`'s Convex
  // functions (apps/gateway/convex/identity.ts) ever read or write this
  // table; everything else reaches a user by `userId` alone.
  identities: defineTable({
    userId: v.string(), // "usr_…" — the app-level id; the only link out of this table
    authProvider: v.union(
      v.literal("google"),
      v.literal("facebook"),
      v.literal("instagram"),
      v.literal("x"),
      v.literal("password"),
    ),
    providerSub: v.string(), // provider subject; the lowercased email for password accounts
    email: v.union(v.string(), v.null()), // Instagram never supplies one — stays null
    emailVerified: v.boolean(), // recorded, NEVER gates anything (README D2)
    // Only set when authProvider is "password" — PBKDF2-SHA256 (libs/identity/src/password.ts),
    // hashed and salted server-side in the gateway, never stored or transmitted in the clear.
    passwordHash: v.optional(v.string()),
    passwordSalt: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_provider", ["authProvider", "providerSub"]),

  // The app-level state that rides along with a user but isn't identity —
  // one row per `identities` row, created at the same time (identity.ts's
  // findOrCreateIdentity). Split out so identity stays exactly "who signed
  // in" and nothing grows on that row that isn't identity.
  profiles: defineTable({
    userId: v.string(), // FK → identities.userId
    senderName: v.union(v.string(), v.null()),
    contactSource: v.union(v.literal("import"), v.literal("manual")),
    checklistTicks: v.array(v.string()), // C3 item keys — account-level, carries across sessions (§2.1)
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_userId", ["userId"]),

  sessions: defineTable({
    sessionId: v.string(), // ULID from the device — the client owns id generation
    userId: v.string(), // FK → identities.userId; no other user data is denormalized here
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
