import { Jwt } from 'hono/utils/jwt';
import type { Caller } from '../caller.js';

/** A public key from a JWKS document. */
type PublicKey = { kid?: string; alg?: string } & JsonWebKey;

export interface VerifierOptions {
  /** Expected `iss` claim, from DATA_AUTH_ISSUER. */
  issuer: string;
  /** Where the issuer publishes its keys, from DATA_AUTH_JWKS_URL. */
  jwksUrl: string;
  /** For tests. Defaults to the global fetch. */
  fetch?: typeof fetch;
  /** For tests. Milliseconds since the epoch. */
  now?: () => number;
}

/** Keys are kept this long, so a normal request makes no network call. */
const KEY_TTL_MS = 10 * 60 * 1000;
/** An unknown key id triggers one refresh, but never more often than this. */
const REFRESH_FLOOR_MS = 60 * 1000;
const USER_ID = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * Builds the check for the user's own token. It runs second, after the gateway's own check, so a
 * stolen gateway key alone cannot act as a user. A bad token returns null (the app answers 401).
 * If the key list cannot be fetched, it throws: that is our fault, not the caller's, so it is a 500.
 *
 * Signature, issuer and expiry are checked with Hono's JWT code (the same call `hono/jwk` makes).
 * The `jwk` middleware itself is not used: it only reads `Authorization: Bearer`, and it fetches the
 * key list on every request. Only RS256 is accepted. The claims are `sub`, `email` and `email_verified`.
 */
export function createTokenVerifier(options: VerifierOptions): (token: string) => Promise<Caller | null> {
  const doFetch = options.fetch ?? fetch;
  const now = options.now ?? Date.now;
  let keys: PublicKey[] = [];
  let loadedAt = Number.NEGATIVE_INFINITY;

  async function load(): Promise<void> {
    const response = await doFetch(options.jwksUrl);
    if (!response.ok) {
      throw new Error('Could not fetch the signing keys.');
    }
    const body = (await response.json()) as { keys?: unknown };
    if (!Array.isArray(body.keys)) {
      throw new Error('The signing key list is malformed.');
    }
    keys = body.keys as PublicKey[];
    loadedAt = now();
  }

  async function keysFor(kid: string): Promise<PublicKey[]> {
    const age = now() - loadedAt;
    if (age > KEY_TTL_MS || (!keys.some((key) => key.kid === kid) && age > REFRESH_FLOOR_MS)) {
      await load();
    }
    return keys;
  }

  return async (token) => {
    let kid: string | undefined;
    try {
      kid = Jwt.decode(token).header.kid;
    } catch {
      return null;
    }
    if (!kid) {
      return null;
    }
    const verificationKeys = await keysFor(kid);
    let payload: Record<string, unknown>;
    try {
      payload = await Jwt.verifyWithJwks(token, {
        keys: verificationKeys,
        verification: { iss: options.issuer },
        allowedAlgorithms: ['RS256'],
      });
    } catch {
      return null;
    }
    return toCaller(payload);
  };
}

/** Builds the caller from claims. Any missing or odd claim means no caller. */
function toCaller(payload: Record<string, unknown>): Caller | null {
  const { sub, email, email_verified: verified, exp } = payload;
  // Hono skips the expiry check when `exp` is absent. A token without it never expires, so refuse it.
  if (typeof exp !== 'number' || typeof sub !== 'string' || !USER_ID.test(sub) || typeof email !== 'string') {
    return null;
  }
  const address = email.trim().toLowerCase();
  if (!address) {
    return null;
  }
  return { userId: sub, email: address, emailVerified: verified === true };
}
