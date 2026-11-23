/** The shape of a Cloudflare Workers Rate Limiting binding. Only `limit` is used. */
interface RateLimitBinding {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

/** Name of the binding in wrangler.toml. */
export const AGENT_RATE_LIMIT_BINDING = 'AGENT_RATE_LIMITER';
/** The binding does not report time left; this is the window length in wrangler.toml, a safe upper bound. */
const RETRY_AFTER_SECONDS = 60;

function bindingFrom(env: unknown): RateLimitBinding | null {
  const candidate = (env as Record<string, unknown> | undefined | null)?.[AGENT_RATE_LIMIT_BINDING];
  if (candidate && typeof (candidate as RateLimitBinding).limit === 'function') {
    return candidate as RateLimitBinding;
  }
  return null;
}

async function isAllowed(binding: RateLimitBinding, ip: string): Promise<boolean> {
  try {
    return (await binding.limit({ key: `ip:${ip}` })).success;
  } catch {
    // Fail open: a broken limiter must not take the endpoint down. Nothing is logged.
    return true;
  }
}

/**
 * Per-IP limit for POST /mcp. Returns a 429 response when the caller is over the limit, or null to
 * let the request through. Off when the binding is missing (local, tests) or there is no
 * CF-Connecting-IP. If the limiter throws, the request goes through.
 */
export async function checkRateLimit(request: Request, env: unknown): Promise<Response | null> {
  const binding = bindingFrom(env);
  const ip = request.headers.get('cf-connecting-ip');
  if (!binding || !ip) {
    return null;
  }
  if (await isAllowed(binding, ip)) {
    return null;
  }
  return new Response(JSON.stringify({ error: 'Too many requests. Please try again in a minute.' }), {
    status: 429,
    headers: { 'Content-Type': 'application/json', 'Retry-After': String(RETRY_AFTER_SECONDS) },
  });
}
