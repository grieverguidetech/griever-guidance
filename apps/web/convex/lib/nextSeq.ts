import type { MutationCtx } from "../_generated/server";

/**
 * DATA.md §4.1 / the brief's step 3, verbatim in spirit. Convex mutations are
 * transactional, so this read-modify-write is safe here — it must never move
 * to an action, and it must never be based on a timestamp (two writes in the
 * same millisecond, or a skewed device clock, silently drop rows from a `>`
 * comparison).
 */
export async function nextSeq(ctx: MutationCtx, userId: string): Promise<number> {
  const row = await ctx.db
    .query("counters")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .unique();
  const seq = (row?.seq ?? 0) + 1;
  if (row) {
    await ctx.db.patch(row._id, { seq });
  } else {
    await ctx.db.insert("counters", { userId, seq, appliedOpIds: [] });
  }
  return seq;
}

const MAX_APPLIED_OP_IDS = 1000;

/**
 * Push's idempotency check (§4.3): a retry of an already-applied `opId` must
 * no-op rather than double-apply. Returns whether `opId` was already applied
 * (and if not, records it, capped to the most recent 1000 per user).
 */
export async function checkAndRecordOpId(
  ctx: MutationCtx,
  userId: string,
  opId: string,
): Promise<{ alreadyApplied: boolean }> {
  const row = await ctx.db
    .query("counters")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .unique();

  if (row?.appliedOpIds.includes(opId)) {
    return { alreadyApplied: true };
  }

  const appliedOpIds = [...(row?.appliedOpIds ?? []), opId].slice(-MAX_APPLIED_OP_IDS);
  if (row) {
    await ctx.db.patch(row._id, { appliedOpIds });
  } else {
    await ctx.db.insert("counters", { userId, seq: 0, appliedOpIds });
  }
  return { alreadyApplied: false };
}
