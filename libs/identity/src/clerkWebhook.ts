import { Hono } from 'hono';
import { callDeleteUser, type DataFunctionConfig } from '@griever/gateway-auth';

const MAX_AGE_SECONDS = 5 * 60;
const USER_ID = /^[A-Za-z0-9_-]{1,64}$/;

type DeleteUser = typeof callDeleteUser;

export interface ClerkWebhookConfig {
  /** Read per request. Clerk shows it as "whsec_<base64>". Null when not set. */
  getWebhookSecret: () => string | null;
  getDataConfig: () => DataFunctionConfig | null;
  /** Read per request. The shared secret for the data function's service path. */
  getServiceSecret: () => string | null;
  /** Overridable in tests. */
  deleteUser?: DeleteUser;
  /** Overridable in tests. Seconds since the epoch. */
  now?: () => number;
}

function base64ToBytes(value: string): Uint8Array<ArrayBuffer> {
  const raw = atob(value);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) {
    bytes[i] = raw.charCodeAt(i);
  }
  return bytes;
}

function bytesToBase64(bytes: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)));
}

function sameText(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Checks a Svix signature: HMAC-SHA256 over "id.timestamp.body" with the base64 key after "whsec_".
 * The header holds space-separated "v1,<base64>" entries; one match is enough.
 * Returns false for a missing header, a bad secret, a stale timestamp or no match.
 */
export async function verifySvix(
  secret: string,
  headers: { id?: string; timestamp?: string; signature?: string },
  body: string,
  nowSeconds: number,
): Promise<boolean> {
  const { id, timestamp, signature } = headers;
  if (!id || !timestamp || !signature || !/^\d{1,12}$/.test(timestamp)) {
    return false;
  }
  if (Math.abs(nowSeconds - Number(timestamp)) > MAX_AGE_SECONDS) {
    return false;
  }
  let key: Awaited<ReturnType<typeof crypto.subtle.importKey>>;
  try {
    const raw = base64ToBytes(
      secret.startsWith('whsec_') ? secret.slice('whsec_'.length) : secret,
    );
    key = await crypto.subtle.importKey(
      'raw',
      raw,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );
  } catch {
    return false;
  }
  const mac = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(`${id}.${timestamp}.${body}`),
  );
  const expected = bytesToBase64(mac);
  return signature.split(' ').some((entry) => {
    const [version, value] = entry.split(',');
    return version === 'v1' && value !== undefined && sameText(value, expected);
  });
}

/**
 * POST /webhooks/clerk. Only a verified `user.deleted` event does anything: it deletes that user's data.
 * Other events answer 204. A failure to delete answers 502 so Clerk retries (deletion is idempotent).
 * Nothing from the body, headers or secrets is logged.
 */
export function createClerkWebhookRouter(config: ClerkWebhookConfig) {
  const router = new Hono();
  const remove = config.deleteUser ?? callDeleteUser;
  const now = config.now ?? (() => Math.floor(Date.now() / 1000));

  router.post('/webhooks/clerk', async (c) => {
    const secret = config.getWebhookSecret();
    if (!secret) {
      return c.json({ error: 'Not configured.' }, 503);
    }
    const body = await c.req.text();
    const valid = await verifySvix(
      secret,
      {
        id: c.req.header('svix-id'),
        timestamp: c.req.header('svix-timestamp'),
        signature: c.req.header('svix-signature'),
      },
      body,
      now(),
    );
    if (!valid) {
      return c.json({ error: 'Invalid signature.' }, 401);
    }

    let event: { type?: unknown; data?: { id?: unknown } };
    try {
      event = JSON.parse(body);
    } catch {
      return c.json({ error: 'Invalid body.' }, 400);
    }
    if (event?.type !== 'user.deleted') {
      return c.body(null, 204);
    }
    const userId = event.data?.id;
    if (typeof userId !== 'string' || !USER_ID.test(userId)) {
      return c.json({ error: 'Invalid body.' }, 400);
    }

    const data = config.getDataConfig();
    const serviceSecret = config.getServiceSecret();
    if (!data || !serviceSecret) {
      return c.json({ error: 'Not configured.' }, 503);
    }
    try {
      await remove(data, serviceSecret, userId);
    } catch {
      return c.json({ error: 'Could not delete.' }, 502);
    }
    return c.body(null, 204);
  });

  return router;
}
