import type { MutationCtx } from "../_generated/server";
/**
 * DATA.md §4.1 / the brief's step 3, verbatim in spirit. Convex mutations are
 * transactional, so this read-modify-write is safe here — it must never move
 * to an action, and it must never be based on a timestamp (two writes in the
 * same millisecond, or a skewed device clock, silently drop rows from a `>`
 * comparison).
 */
export declare function nextSeq(ctx: MutationCtx, userId: string): Promise<number>;
/**
 * Push's idempotency check (§4.3): a retry of an already-applied `opId` must
 * no-op rather than double-apply. Returns whether `opId` was already applied
 * (and if not, records it, capped to the most recent 1000 per user).
 */
export declare function checkAndRecordOpId(ctx: MutationCtx, userId: string, opId: string): Promise<{
    alreadyApplied: boolean;
}>;
//# sourceMappingURL=nextSeq.d.ts.map