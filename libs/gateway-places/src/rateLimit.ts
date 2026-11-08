import type { MiddlewareHandler } from 'hono';

/** The shape of a Cloudflare Workers Rate Limiting binding. Only `limit` is used. */
interface RateLimitBinding {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

/** Name of the binding in wrangler.toml. Read from the Worker env (`c.env`), never process.env. */
export const PLACES_RATE_LIMIT_BINDING = 'PLACES_RATE_LIMITER';
export const PLACES_RATE_LIMITED = 'Place search is busy. Please type the place in.';
/** The binding does not report time left; this is the window length in wrangler.toml, a safe upper bound. */
const RETRY_AFTER_SECONDS = 60;

function bindingFrom(env: unknown): RateLimitBinding | null {
  const candidate = (env as Record<string, unknown> | undefined | null)?.[PLACES_RATE_LIMIT_BINDING];
  if (candidate && typeof (candidate as RateLimitBinding).limit === 'function') {
    return candidate as RateLimitBinding;
  }
  return null;
}

/**
 * Per-IP limit for the public place routes (suggest and details share one bucket). Off when the
 * binding is missing (local, tests) or there is no CF-Connecting-IP (the local node server). If the
 * limiter throws, the request goes through; the Google daily quota cap is the backstop.
 * Known weakness: carrier NAT can put many phones behind one IP. Fine at this app's scale.
 */
export function placesRateLimit(): MiddlewareHandler {
  return async (c, next) => {
    const binding = bindingFrom(c.env);
    const ip = c.req.header('cf-connecting-ip');
    if (!binding || !ip) {
      return next();
    }
    let allowed = true;
    try {
      allowed = (await binding.limit({ key: `ip:${ip}` })).success;
    } catch {
      allowed = true;
    }
    if (!allowed) {
      return c.json({ error: PLACES_RATE_LIMITED }, 429, { 'Retry-After': String(RETRY_AFTER_SECONDS) });
    }
    return next();
  };
}
