export declare const purgeOldDeleted: import("convex/server").RegisteredMutation<"internal", {}, Promise<void>>;
declare const crons: import("convex/server").Crons;
export default crons;
/**
 * "Delete everything" in settings (§7) — the one exception to the 90-day
 * window: purges this user's sessions immediately, nulls the personal fields
 * on their `users` row, and returns so the client clears every local store
 * (including the outbox). No tombstone, no confirmation round-trip.
 */
export declare const deleteEverything: import("convex/server").RegisteredMutation<"public", {
    devUserId?: string | undefined;
}, Promise<void>>;
//# sourceMappingURL=crons.d.ts.map