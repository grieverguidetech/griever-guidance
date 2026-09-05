import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireUser } from "./auth";
import { nextSeq, checkAndRecordOpId } from "./lib/nextSeq";

// DATA.md §4.2, verbatim shape. `devUserId` is this deployment's stand-in for
// the header the real auth provider will carry — see convex/auth.ts.
export const pull = query({
  args: {
    cursor: v.number(),
    limit: v.optional(v.number()),
    devUserId: v.optional(v.string()),
  },
  handler: async (ctx, { cursor, limit = 100, devUserId }) => {
    const userId = await requireUser(ctx, { devUserId });
    const rows = await ctx.db
      .query("sessions")
      .withIndex("by_user_seq", (q) => q.eq("userId", userId).gt("seq", cursor))
      .order("asc")
      .take(limit + 1);
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    return {
      sessions: page, // includes soft-deleted rows — see DATA.md §4.2
      cursor: page.length ? page[page.length - 1].seq : cursor,
      hasMore,
    };
  },
});

const screenEntryValidator = v.object({
  status: v.union(
    v.literal("pending"),
    v.literal("active"),
    v.literal("complete"),
    v.literal("seen"),
    v.literal("skipped"),
  ),
  updatedAt: v.number(),
  values: v.optional(v.any()),
});

// DATA.md §4.3's one shown op type. The op-type union is intentionally open
// for a future `user.upsert` (checklistTicks/senderName aren't covered by
// this pass — see the summary) without a schema break.
const sessionUpsertOp = v.object({
  opId: v.string(),
  sessionId: v.string(),
  type: v.literal("session.upsert"),
  patch: v.object({
    schemaVersion: v.optional(v.number()),
    status: v.optional(
      v.union(v.literal("in_progress"), v.literal("sent"), v.literal("archived")),
    ),
    cursorScreen: v.optional(v.union(v.string(), v.null())),
    personName: v.optional(v.union(v.string(), v.null())),
    dateOfPassing: v.optional(v.union(v.string(), v.null())),
    lastOpenedAt: v.optional(v.number()),
    deletedAt: v.optional(v.union(v.number(), v.null())),
    screens: v.optional(v.record(v.string(), screenEntryValidator)),
  }),
  createdAt: v.number(),
});

export const push = mutation({
  args: {
    deviceId: v.string(),
    ops: v.array(sessionUpsertOp),
    devUserId: v.optional(v.string()),
  },
  handler: async (ctx, { deviceId, ops, devUserId }) => {
    const userId = await requireUser(ctx, { devUserId });
    const acks: { opId: string; seq: number; serverUpdatedAt: number }[] = [];

    for (const op of ops) {
      // Idempotent by opId (§4.3): a retry after a lost response must not
      // double-apply. Composed with deviceId since the client's own opId is a
      // per-device local counter, not globally unique on its own.
      const idempotencyKey = `${deviceId}:${op.opId}`;
      const { alreadyApplied } = await checkAndRecordOpId(ctx, userId, idempotencyKey);

      const existing = await ctx.db
        .query("sessions")
        .withIndex("by_sessionId", (q) => q.eq("sessionId", op.sessionId))
        .unique();

      if (alreadyApplied) {
        // No-op — but still ack with the row's current state so a retried
        // push behaves the same as the first attempt from the caller's side.
        if (existing) {
          acks.push({ opId: op.opId, seq: existing.seq, serverUpdatedAt: existing.updatedAt });
        }
        continue;
      }

      const now = Date.now();
      const incomingScreens = op.patch.screens ?? {};
      // The invariant from DATA.md §2: session.updatedAt = max(screen.updatedAt).
      // Used to decide whether this op's top-level scalars are newer than
      // what's stored — the same "greater session.updatedAt wins" rule from
      // §4.4, applied to a partial patch instead of two full documents.
      const incomingSessionUpdatedAt = Object.values(incomingScreens).reduce(
        (max, entry) => Math.max(max, entry.updatedAt),
        0,
      );

      if (!existing) {
        const seq = await nextSeq(ctx, userId);
        await ctx.db.insert("sessions", {
          sessionId: op.sessionId,
          userId,
          schemaVersion: op.patch.schemaVersion ?? 1,
          status: op.patch.status ?? "in_progress",
          screens: incomingScreens,
          cursorScreen: op.patch.cursorScreen ?? null,
          personName: op.patch.personName ?? null,
          dateOfPassing: op.patch.dateOfPassing ?? null,
          lastOpenedAt: op.patch.lastOpenedAt ?? now,
          createdAt: op.createdAt,
          seq,
          updatedAt: incomingSessionUpdatedAt || now,
          deletedAt: op.patch.deletedAt ?? null,
          deviceId,
        });
        acks.push({ opId: op.opId, seq, serverUpdatedAt: incomingSessionUpdatedAt || now });
        continue;
      }

      // Per-screen last-writer-wins, server-side too (step 4): a push
      // carrying a stale screen cannot clobber a newer one written from
      // another device.
      const mergedScreens = { ...existing.screens };
      for (const [key, incoming] of Object.entries(incomingScreens)) {
        const current = mergedScreens[key];
        if (!current || incoming.updatedAt > current.updatedAt) {
          mergedScreens[key] = incoming;
        }
      }

      const scalarsAreNewer = incomingSessionUpdatedAt > existing.updatedAt;
      const seq = await nextSeq(ctx, userId);

      await ctx.db.patch(existing._id, {
        screens: mergedScreens,
        seq,
        deviceId,
        // Deleting is an explicit, authoritative action — always applied,
        // never gated behind the scalar-merge comparison.
        ...(op.patch.deletedAt !== undefined ? { deletedAt: op.patch.deletedAt } : {}),
        ...(scalarsAreNewer
          ? {
              updatedAt: incomingSessionUpdatedAt,
              ...(op.patch.status !== undefined ? { status: op.patch.status } : {}),
              ...(op.patch.cursorScreen !== undefined ? { cursorScreen: op.patch.cursorScreen } : {}),
              ...(op.patch.personName !== undefined ? { personName: op.patch.personName } : {}),
              ...(op.patch.dateOfPassing !== undefined ? { dateOfPassing: op.patch.dateOfPassing } : {}),
              ...(op.patch.lastOpenedAt !== undefined ? { lastOpenedAt: op.patch.lastOpenedAt } : {}),
            }
          : {}),
      });

      acks.push({
        opId: op.opId,
        seq,
        serverUpdatedAt: scalarsAreNewer ? incomingSessionUpdatedAt : existing.updatedAt,
      });
    }

    return { acks };
  },
});
