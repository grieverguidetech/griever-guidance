import type { SupabaseConfig } from './supabaseJwt.js';

/** A non-2xx PostgREST answer: the HTTP status plus PostgREST's own error code, if it sent one. */
export class PostgrestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string | null,
    message: string,
  ) {
    super(message);
    this.name = 'PostgrestError';
  }
}

/**
 * Headers for PostgREST as the caller: the anon key identifies the project and
 * the caller's own JWT decides what row-level security lets through. There is
 * deliberately no service-role key anywhere in the gateway.
 */
export function postgrestHeaders(config: SupabaseConfig, accessToken: string): Record<string, string> {
  return {
    apikey: config.anonKey,
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  };
}

async function errorFrom(res: Response): Promise<PostgrestError> {
  let code: string | null = null;
  try {
    const body = (await res.json()) as { code?: unknown };
    if (typeof body?.code === 'string') code = body.code;
  } catch {
    // Not JSON: the status alone is still useful.
  }
  return new PostgrestError(res.status, code, `postgrest request failed (${res.status}${code ? ` ${code}` : ''})`);
}

/** Sends a request to `/rest/v1/<path>`; throws `PostgrestError` on non-2xx. */
export async function postgrestRequest(
  config: SupabaseConfig,
  accessToken: string,
  path: string,
  init: { method?: string; body?: unknown; headers?: Record<string, string> } = {},
): Promise<Response> {
  const res = await fetch(`${config.url}/rest/v1/${path}`, {
    method: init.method ?? 'GET',
    headers: { ...postgrestHeaders(config, accessToken), ...init.headers },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  if (!res.ok) throw await errorFrom(res);
  return res;
}

/** Calls a Postgres function: POST `/rest/v1/rpc/<name>` with a JSON body. Returns the parsed JSON. */
export async function rpc<T = unknown>(
  config: SupabaseConfig,
  accessToken: string,
  name: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  const res = await postgrestRequest(config, accessToken, `rpc/${name}`, { method: 'POST', body: args });
  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}
