import type { MiddlewareHandler } from 'hono';
import { createTokenVerifier } from './verifyToken.js';
import type { Caller } from './caller.js';

export interface ClerkConfig {
  /** Clerk Frontend API URL (https). Becomes the expected `iss` claim. */
  issuer: string;
  /** Allowed `azp` values (web origins). Empty means no check. */
  authorizedParties: string[];
}

/** Set on the Hono context by `clerkAuth`. `userId` and `accessToken` match `supabaseAuth`. */
export interface ClerkAuthVariables {
  userId: string;
  accessToken: string;
  caller: Caller;
}

const UNAVAILABLE = 'Accounts are not available right now.';
const SIGN_IN_AGAIN = 'Please sign in again.';

// One verifier per isolate and config, so its key cache survives between requests.
const verifiers = new Map<string, ReturnType<typeof createTokenVerifier>>();

/** Test hook: forget cached verifiers (and their keys) so each test starts clean. */
export function clearClerkCache(): void {
  verifiers.clear();
}

function verifierFor(config: ClerkConfig) {
  // A trailing slash on the issuer must not change the JWKS URL or the expected `iss`.
  const issuer = config.issuer.replace(/\/+$/, '');
  const cacheKey = JSON.stringify([issuer, config.authorizedParties]);
  let verify = verifiers.get(cacheKey);
  if (!verify) {
    verify = createTokenVerifier({
      issuer,
      jwksUrl: `${issuer}/.well-known/jwks.json`,
      authorizedParties: config.authorizedParties,
    });
    verifiers.set(cacheKey, verify);
  }
  return verify;
}

/**
 * Verifies a Clerk session token (RS256) from `Authorization: Bearer`.
 *   missing / malformed / expired / wrong issuer / wrong azp / no email / bad signature -> 401
 *   key list unreachable -> 503 (the token may be fine; we just cannot tell)
 *   CLERK_ISSUER unset -> 503
 * The token is never logged.
 */
export function clerkAuth(getConfig: () => ClerkConfig | null): MiddlewareHandler {
  return async (c, next) => {
    const config = getConfig();
    if (!config) {
      return c.json({ error: UNAVAILABLE }, 503);
    }
    const token = /^Bearer\s+(\S+)$/i.exec(c.req.header('Authorization') ?? '')?.[1];
    if (!token) {
      return c.json({ error: SIGN_IN_AGAIN }, 401);
    }

    let caller: Caller | null;
    try {
      caller = await verifierFor(config)(token);
    } catch {
      return c.json({ error: UNAVAILABLE }, 503);
    }
    if (!caller) {
      return c.json({ error: SIGN_IN_AGAIN }, 401);
    }
    c.set('userId', caller.userId);
    c.set('accessToken', token);
    c.set('caller', caller);
    return next();
  };
}
