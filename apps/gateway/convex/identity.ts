import { mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
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
 * The profile every new identity gets, regardless of how they signed up —
 * shared by `findOrCreateIdentity` (OAuth) and `signUpWithPassword` so the
 * "what a fresh account looks like" rule lives in exactly one place.
 */
async function createProfileForNewIdentity(
  ctx: MutationCtx,
  userId: string,
  contactSource: "import" | "manual",
  senderName: string | null,
  now: number,
): Promise<void> {
  await ctx.db.insert("profiles", {
    userId,
    senderName,
    contactSource,
    checklistTicks: [],
    createdAt: now,
    updatedAt: now,
  });
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
    // a social provider implies "I'll import contacts" — email/password
    // (signUpWithPassword below) implies manual entry instead.
    await createProfileForNewIdentity(ctx, userId, "import", null, now);

    return { userId, isNewIdentity: true };
  },
});

/**
 * Email/password sign-up. `passwordHash`/`passwordSalt` arrive already
 * hashed (libs/identity/src/password.ts, PBKDF2-SHA256) — this function
 * never sees, and Convex never stores, the plaintext password.
 */
export const signUpWithPassword = mutation({
  args: {
    serviceSecret: v.string(),
    email: v.string(),
    passwordHash: v.string(),
    passwordSalt: v.string(),
    senderName: v.string(),
  },
  handler: async (ctx, { serviceSecret, email, passwordHash, passwordSalt, senderName }) => {
    requireServiceCaller(serviceSecret);
    const normalizedEmail = email.trim().toLowerCase();

    const existing = await ctx.db
      .query("identities")
      .withIndex("by_provider", (q) => q.eq("authProvider", "password").eq("providerSub", normalizedEmail))
      .unique();
    if (existing) {
      throw new Error("An account with that email already exists.");
    }

    const now = Date.now();
    const userId = newUserId();

    await ctx.db.insert("identities", {
      userId,
      authProvider: "password",
      providerSub: normalizedEmail,
      email: normalizedEmail,
      emailVerified: false,
      passwordHash,
      passwordSalt,
      createdAt: now,
    });

    await createProfileForNewIdentity(ctx, userId, "manual", senderName, now);

    return { userId, isNewIdentity: true };
  },
});

/**
 * What `/auth/password/signin` needs to verify a password — the hash and
 * salt only, never anything else about the identity. Password verification
 * itself happens in `libs/identity` (the gateway), not here, since that's
 * where the plaintext password the browser sent is briefly available.
 */
export const getPasswordCredential = query({
  args: { serviceSecret: v.string(), email: v.string() },
  handler: async (ctx, { serviceSecret, email }) => {
    requireServiceCaller(serviceSecret);
    const normalizedEmail = email.trim().toLowerCase();

    const identity = await ctx.db
      .query("identities")
      .withIndex("by_provider", (q) => q.eq("authProvider", "password").eq("providerSub", normalizedEmail))
      .unique();
    if (!identity || !identity.passwordHash || !identity.passwordSalt) return null;

    return { userId: identity.userId, passwordHash: identity.passwordHash, passwordSalt: identity.passwordSalt };
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
