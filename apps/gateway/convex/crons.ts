import { cronJobs } from "convex/server";
import { internalMutation, mutation } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { requireUser } from "./auth";

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

// DATA.md §7: soft-delete, then hard-purge at 90 days. Without this, "delete"
// in the UI is a lie — a hard delete elsewhere is invisible to a cursor pull,
// which is the entire reason sessions soft-delete in the first place.
export const purgeOldDeleted = internalMutation({
  args: {},
  handler: async (ctx) => {
    const cutoff = Date.now() - NINETY_DAYS_MS;
    const candidates = await ctx.db.query("sessions").collect();
    for (const row of candidates) {
      if (row.deletedAt !== null && row.deletedAt < cutoff) {
        await ctx.db.delete(row._id);
      }
    }
  },
});

const crons = cronJobs();
crons.daily("purge soft-deleted sessions", { hourUTC: 9, minuteUTC: 0 }, internal.crons.purgeOldDeleted);
export default crons;

/**
 * "Delete everything" in settings (§7) — the one exception to the 90-day
 * window: purges this user's sessions immediately, nulls the personal fields
 * on their `users` row, and returns so the client clears every local store
 * (including the outbox). No tombstone, no confirmation round-trip.
 */
export const deleteEverything = mutation({
  args: { devUserId: v.optional(v.string()) },
  handler: async (ctx, { devUserId }) => {
    const userId = await requireUser(ctx, { devUserId });

    const sessions = await ctx.db
      .query("sessions")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    for (const row of sessions) {
      await ctx.db.delete(row._id);
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();
    if (user) {
      await ctx.db.patch(user._id, {
        email: null,
        senderName: null,
        checklistTicks: [],
        providerSub: "",
      });
    }
  },
});
