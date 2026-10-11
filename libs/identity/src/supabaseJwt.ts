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
  lastForcedRefetch.clear();
  inFlight.clear();
}

/**
 * Plain `Error` on purpose: hono/jwk rethrows a plain Error as-is, but turns
 * any other error (including a network TypeError) into a 401. We want
 * "Supabase unreachable" to be a 503, not "your token is bad".
 */
function jwksUnavailable(): Error {
  return new Error('jwks_unavailable');
}

const FORCED_REFETCH_MIN_INTERVAL_MS = 30 * 1000;
const lastForcedRefetch = new Map<string, number>();
const inFlight = new Map<string, Promise<HonoJsonWebKey[]>>();

/** One shared request per URL at a time, so concurrent callers do not stampede Supabase. */
function fetchJwks(supabaseUrl: string): Promise<HonoJsonWebKey[]> {
  const pending = inFlight.get(supabaseUrl);
  if (pending) return pending;
  const request = (async () => {
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
  })().finally(() => inFlight.delete(supabaseUrl));
  inFlight.set(supabaseUrl, request);
  return request;
}

async function loadJwks(supabaseUrl: string): Promise<HonoJsonWebKey[]> {
  const cached = jwksCache.get(supabaseUrl);
  if (cached && Date.now() - cached.fetchedAt < JWKS_TTL_MS) return cached.keys;
  return fetchJwks(supabaseUrl);
}

/**
 * Key rotation: when a token names a kid we do not have, refetch once, at most
 * every 30 s per project. A failed refetch is ignored; the old keys still decide.
 */
async function refetchOnUnknownKid(supabaseUrl: string, token: string): Promise<void> {
  let kid: unknown;
  try {
    const header = JSON.parse(atob(token.split('.')[0].replace(/-/g, '+').replace(/_/g, '/')));
    kid = header?.kid;
  } catch {
    return; // malformed: hono/jwk will answer 401
  }
  if (typeof kid !== 'string') return;
  const keys = await loadJwks(supabaseUrl);
  if (keys.some((key) => key.kid === kid)) return;
  const last = lastForcedRefetch.get(supabaseUrl) ?? 0;
  if (Date.now() - last < FORCED_REFETCH_MIN_INTERVAL_MS) return;
  lastForcedRefetch.set(supabaseUrl, Date.now());
  await fetchJwks(supabaseUrl).catch(() => undefined);
}

/**
 * Verifies a Supabase access token (ES256, audience "authenticated",
 * issuer `${SUPABASE_URL}/auth/v1`) against
 * the project's JWKS and exposes `sub` as `userId`.
 *   missing / malformed / expired / wrong audience / wrong or missing issuer / bad signature -> 401
 *   JWKS unreachable -> 503 (the token may be fine; we just cannot tell)
 *   SUPABASE_URL or SUPABASE_ANON_KEY unset -> 503
 */
export function supabaseAuth(getConfig: () => SupabaseConfig | null): MiddlewareHandler {
  return async (c, next) => {
    const config = getConfig();
    if (!config) {
      return c.json({ error: 'Accounts are not available right now.' }, 503);
    }

    // A trailing slash on SUPABASE_URL must not change the JWKS URL or the issuer.
    const baseUrl = config.url.replace(/\/+$/, '');
    const verify = jwk({
      keys: () => loadJwks(baseUrl),
      alg: ['ES256'],
      // hono rejects a token whose iss is missing or not exactly this string.
      verification: { aud: 'authenticated', iss: `${baseUrl}/auth/v1` },
    });

    let verified = false;
    try {
      const bearer = /^Bearer\s+(\S+)$/i.exec(c.req.header('Authorization') ?? '');
      if (bearer?.[1]) await refetchOnUnknownKid(baseUrl, bearer[1]);
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

    // hono accepts tokens with no exp; Supabase always sets one, so require it.
    const payload = c.get('jwtPayload') as { sub?: unknown; exp?: unknown } | undefined;
    if (typeof payload?.exp !== 'number' || typeof payload.sub !== 'string' || payload.sub === '') {
      return c.json({ error: 'Please sign in again.' }, 401);
    }
    c.set('userId', payload.sub);
    c.set('accessToken', (c.req.header('Authorization') ?? '').split(/\s+/)[1] ?? '');
    return next();
  };
}
