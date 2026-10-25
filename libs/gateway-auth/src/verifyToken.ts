import { Jwt } from 'hono/utils/jwt';
import type { Caller } from './caller.js';

/** A public key from a JWKS document. */
type PublicKey = { kid?: string; alg?: string } & JsonWebKey;

export interface VerifierOptions {
  /** Expected `iss` claim, from DATA_AUTH_ISSUER. */
  issuer: string;
  /** Where the issuer publishes its keys, from DATA_AUTH_JWKS_URL. */
  jwksUrl: string;
  /** If set, a token that carries `azp` must name one of these. A token with no `azp` is allowed. */
  authorizedParties?: string[];
  /** For tests. Defaults to the global fetch. */
  fetch?: typeof fetch;
  /** For tests. Milliseconds since the epoch, for the key cache only. */
  now?: () => number;
}

/** Keys are kept this long, so a normal request makes no network call. */
const KEY_TTL_MS = 10 * 60 * 1000;
/** An unknown key id triggers one refresh, but never more often than this. */
const REFRESH_FLOOR_MS = 60 * 1000;
/** The key list must answer in this time, or the request fails. */
const FETCH_TIMEOUT_MS = 3000;
/** Clocks differ a little between the issuer and this function. */
const LEEWAY_SECONDS = 5;
const USER_ID = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * Builds the check for the user's own token. It runs second, after the gateway's own check, so a
 * stolen gateway key alone cannot act as a user. A bad token returns null (the app answers 401).
 * If the key list cannot be fetched, it throws: that is our fault, not the caller's, so it is a 500.
 * Once keys are cached, a failed refresh keeps the cached keys and tries again later.
 *
 * Signature, issuer and expiry are checked with Hono's JWT code (the same call `hono/jwk` makes).
 * The `jwk` middleware itself is not used: it only reads `Authorization: Bearer`, and it fetches the
 * key list on every request. Only RS256 is accepted. The claims are `sub`, `email` and `email_verified`.
 * Hono checks `exp`, `nbf` and `iat` with no leeway, so those three are turned off there and checked
 * in `toCaller` with a few seconds of leeway.
 */
export function createTokenVerifier(options: VerifierOptions): (token: string) => Promise<Caller | null> {
  const doFetch = options.fetch ?? fetch;
  const now = options.now ?? Date.now;
  let keys: PublicKey[] = [];
  let loadedAt = Number.NEGATIVE_INFINITY;
  let attemptedAt = Number.NEGATIVE_INFINITY;

  async function load(): Promise<void> {
    attemptedAt = now();
    const response = await doFetch(options.jwksUrl, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
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
    const stale = now() - loadedAt > KEY_TTL_MS;
    const unknown = !keys.some((key) => key.kid === kid);
    const mayRetry = now() - attemptedAt > REFRESH_FLOOR_MS;
    if (keys.length === 0 || ((stale || unknown) && mayRetry)) {
      try {
        await load();
      } catch (error) {
        // With no keys at all there is nothing to check against. Otherwise keep the old keys.
        if (keys.length === 0) {
          throw error;
        }
      }
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
        verification: { iss: options.issuer, exp: false, nbf: false, iat: false },
        allowedAlgorithms: ['RS256'],
      });
    } catch {
      return null;
    }
    return toCaller(payload, options.authorizedParties ?? []);
  };
}

/** True when a time claim is absent, or is a finite number that passes `ok`. Any other type fails. */
function timeClaim(value: unknown, ok: (seconds: number) => boolean): boolean {
  if (value === undefined) {
    return true;
  }
  return typeof value === 'number' && Number.isFinite(value) && ok(value);
}

/** Builds the caller from claims. Any missing or odd claim means no caller. */
function toCaller(payload: Record<string, unknown>, authorizedParties: string[]): Caller | null {
  const { sub, email, email_verified: verified, exp, iat, nbf, azp } = payload;
  const now = Date.now() / 1000;
  // Hono skips the expiry check when `exp` is absent. A token without it never expires, so refuse it.
  if (typeof exp !== 'number' || typeof sub !== 'string' || !USER_ID.test(sub) || typeof email !== 'string') {
    return null;
  }
  if (
    !timeClaim(exp, (seconds) => seconds > now - LEEWAY_SECONDS) ||
    !timeClaim(iat, (seconds) => seconds <= now + LEEWAY_SECONDS) ||
    !timeClaim(nbf, (seconds) => seconds <= now + LEEWAY_SECONDS)
  ) {
    return null;
  }
  if (authorizedParties.length > 0 && azp !== undefined && (typeof azp !== 'string' || !authorizedParties.includes(azp))) {
    return null;
  }
  const address = email.trim().toLowerCase();
  if (!address) {
    return null;
  }
  return { userId: sub, email: address, emailVerified: verified === true };
}
export type { Caller } from './caller.js';
