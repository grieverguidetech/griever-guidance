import type { MiddlewareHandler } from 'hono';

/**
 * The shape of a Cloudflare Workers Rate Limiting binding (`[[ratelimits]]` in wrangler.toml).
 * Only `limit` is used. Counts are per Cloudflare location and eventually consistent, so this is
 * a guard against runaway clients, not an exact quota.
 */
export interface RateLimitBinding {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

/** The name of the binding in wrangler.toml. Read from the Worker env (`c.env`), never process.env. */
export const WRITE_RATE_LIMIT_BINDING = 'WRITE_RATE_LIMITER';

/**
 * Retry-After sent with a 429. The binding does not report time left in its window, so this is the
 * window length (60 s in wrangler.toml): an upper bound, which is safe for a client to wait.
 */
export const WRITE_RATE_LIMIT_RETRY_AFTER_SECONDS = 60;

export const RATE_LIMITED = 'You are saving very quickly. Your changes are kept. Please try again in a minute.';

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function bindingFrom(env: unknown): RateLimitBinding | null {
  const candidate = (env as Record<string, unknown> | undefined | null)?.[WRITE_RATE_LIMIT_BINDING];
  if (candidate && typeof (candidate as RateLimitBinding).limit === 'function') {
    return candidate as RateLimitBinding;
  }
  return null;
}

/**
 * Per-user limit on write requests (POST, PUT, PATCH, DELETE). Mount it after `clerkAuth` so the
 * key is the verified user id. With no user it does nothing. With no binding (local dev, tests) it does nothing. If the limiter itself errors,
 * the request goes through: a broken limiter must never block someone saving their work.
 */
export function writeRateLimit(): MiddlewareHandler {
  return async (c, next) => {
    if (!WRITE_METHODS.has(c.req.method)) {
      return next();
    }
    const binding = bindingFrom(c.env);
    if (!binding) {
      return next();
    }
    const userId = c.get('userId') as string | undefined;
    if (!userId) {
      // Not expected after clerkAuth. Without a user there is no honest key (one shared bucket would
      // let one caller limit everyone), so let the route's own checks decide.
      return next();
    }
    const key = `user:${userId}`;

    let allowed = true;
    try {
      allowed = (await binding.limit({ key })).success;
    } catch {
      allowed = true;
    }
    if (!allowed) {
      return c.json({ error: RATE_LIMITED }, 429, {
        'Retry-After': String(WRITE_RATE_LIMIT_RETRY_AFTER_SECONDS),
      });
    }
    return next();
  };
}
