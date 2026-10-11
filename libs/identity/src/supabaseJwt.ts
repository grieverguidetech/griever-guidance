import { jwk } from 'hono/jwk';
import { HTTPException } from 'hono/http-exception';
import type { MiddlewareHandler } from 'hono';
import type { HonoJsonWebKey } from 'hono/utils/jwt/jws';

export interface SupabaseConfig {
  url: string;
  anonKey: string;
}

/** Set on the Hono context by `supabaseAuth` for the routes behind it. */
export interface SupabaseAuthVariables {
  userId: string;
  accessToken: string;
}

const JWKS_TTL_MS = 5 * 60 * 1000;

interface CachedJwks {
  keys: HonoJsonWebKey[];
  fetchedAt: number;
}

// Per isolate, keyed by Supabase URL. Public keys only; nothing secret is cached.
const jwksCache = new Map<string, CachedJwks>();

/** Test hook: forget cached keys so each test starts clean. */
export function clearJwksCache(): void {
  jwksCache.clear();
}

/**
 * Plain `Error` on purpose: hono/jwk rethrows a plain Error as-is, but turns
 * any other error (including a network TypeError) into a 401. We want
 * "Supabase unreachable" to be a 503, not "your token is bad".
 */
function jwksUnavailable(): Error {
  return new Error('jwks_unavailable');
}

async function loadJwks(supabaseUrl: string): Promise<HonoJsonWebKey[]> {
  const cached = jwksCache.get(supabaseUrl);
  if (cached && Date.now() - cached.fetchedAt < JWKS_TTL_MS) return cached.keys;

  let keys: unknown;
  try {
    const res = await fetch(`${supabaseUrl}/auth/v1/.well-known/jwks.json`);
    if (!res.ok) throw jwksUnavailable();
    keys = ((await res.json()) as { keys?: unknown }).keys;
  } catch {
    throw jwksUnavailable();
  }
  if (!Array.isArray(keys)) throw jwksUnavailable();
  jwksCache.set(supabaseUrl, { keys: keys as HonoJsonWebKey[], fetchedAt: Date.now() });
  return keys as HonoJsonWebKey[];
}

/**
 * Verifies a Supabase access token (ES256, audience "authenticated") against
 * the project's JWKS and exposes `sub` as `userId`.
 *   missing / malformed / expired / wrong audience / bad signature -> 401
 *   JWKS unreachable -> 503 (the token may be fine; we just cannot tell)
 *   SUPABASE_URL or SUPABASE_ANON_KEY unset -> 503
 */
export function supabaseAuth(getConfig: () => SupabaseConfig | null): MiddlewareHandler {
  return async (c, next) => {
    const config = getConfig();
    if (!config) {
      return c.json({ error: 'Accounts are not available right now.' }, 503);
    }

    const verify = jwk({
      keys: () => loadJwks(config.url),
      alg: ['ES256'],
      verification: { aud: 'authenticated' },
    });

    let verified = false;
    try {
      await verify(c, async () => {
        verified = true;
      });
    } catch (err) {
      if (err instanceof HTTPException) {
        return c.json({ error: 'Please sign in again.' }, 401);
      }
      return c.json({ error: 'Accounts are not available right now.' }, 503);
    }
    if (!verified) return c.json({ error: 'Please sign in again.' }, 401);

    const payload = c.get('jwtPayload') as { sub?: unknown } | undefined;
    if (typeof payload?.sub !== 'string' || payload.sub === '') {
      return c.json({ error: 'Please sign in again.' }, 401);
    }
    c.set('userId', payload.sub);
    c.set('accessToken', (c.req.header('Authorization') ?? '').split(/\s+/)[1] ?? '');
    return next();
  };
}
