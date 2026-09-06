import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

/**
 * The identity table's only writers/readers. Unlike `sync.ts`'s functions,
 * these can't be gated behind `requireUser` (convex/auth.ts) — the whole
 * point is establishing *which* userId a signed-in person is, before any
 * userId exists to check. They're gated behind a server-to-server secret
 * instead: only the gateway's `libs/identity` (which has already verified
 * the OAuth code with Facebook/Instagram) is meant to call these, never a
 * browser or app directly. Both env vars must match — `IDENTITY_SERVICE_SECRET`
 * set here via `npx convex env set` and on the gateway via its own env.
 */
function requireServiceCaller(serviceSecret: string): void {
  const expected = process.env["IDENTITY_SERVICE_SECRET"];
  if (!expected || serviceSecret !== expected) {
    throw new Error("Not authorized to call identity functions directly.");
  }
}

const authProviderValidator = v.union(
  v.literal("google"),
  v.literal("facebook"),
  v.literal("instagram"),
  v.literal("x"),
  v.literal("password"),
);

function newUserId(): string {
  return `usr_${crypto.randomUUID().replace(/-/g, "")}`;
}

/**
 * Find the identity for a given provider + provider-subject, creating both
 * the `identities` row and its paired empty `profiles` row if this is the
 * first time this person has signed in. One identity ever exists per
 * (authProvider, providerSub) pair — a returning user always gets the same
 * userId back, never a duplicate account.
 */
export const findOrCreateIdentity = mutation({
  args: {
    serviceSecret: v.string(),
    authProvider: authProviderValidator,
    providerSub: v.string(),
    email: v.union(v.string(), v.null()),
    emailVerified: v.boolean(),
  },
  handler: async (ctx, { serviceSecret, authProvider, providerSub, email, emailVerified }) => {
    requireServiceCaller(serviceSecret);

    const existing = await ctx.db
      .query("identities")
      .withIndex("by_provider", (q) => q.eq("authProvider", authProvider).eq("providerSub", providerSub))
      .unique();

    if (existing) {
      return { userId: existing.userId, isNewIdentity: false };
    }

    const now = Date.now();
    const userId = newUserId();

    await ctx.db.insert("identities", {
      userId,
      authProvider,
      providerSub,
      email,
      emailVerified,
      createdAt: now,
    });

    // Contact source (D1) follows straight from how the account signed up:
    // a social provider implies "I'll import contacts", email/password
    // implies manual entry — same rule `useAccount.createAccount` (the
    // mocked client-side version) already applies.
    await ctx.db.insert("profiles", {
      userId,
      senderName: null,
      contactSource: authProvider === "password" ? "manual" : "import",
      checklistTicks: [],
      createdAt: now,
      updatedAt: now,
    });

    return { userId, isNewIdentity: true };
  },
});

/** What `/auth/session` returns once a bearer token has been verified. */
export const getIdentityAndProfile = query({
  args: { serviceSecret: v.string(), userId: v.string() },
  handler: async (ctx, { serviceSecret, userId }) => {
    requireServiceCaller(serviceSecret);

    const identity = await ctx.db
      .query("identities")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();
    if (!identity) return null;

    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();

    return {
      userId: identity.userId,
      authProvider: identity.authProvider,
      email: identity.email,
      emailVerified: identity.emailVerified,
      senderName: profile?.senderName ?? null,
      contactSource: profile?.contactSource ?? "manual",
      checklistTicks: profile?.checklistTicks ?? [],
    };
  },
});
