import { Hono } from 'hono';
import {
  callData,
  clerkAuth,
  type ClerkAuthVariables,
  type ClerkConfig,
  type DataFunctionConfig,
} from '@griever/gateway-auth';
import type { AccountContactSource, AccountType, DataResult, Profile, ProfileUpdate } from '@griever/shared';

const MAX_SENDER_NAME_LENGTH = 100;
const ALLOWED_KEYS = ['senderName', 'contactSource'];
// A data function failure (busy, unreachable, crashed) is reported as 503: from the user's
// side the answer is the same, try again later.
const UNAVAILABLE = 'Your details could not be reached right now. Please try again in a moment.';
const SIGN_IN_AGAIN = 'Please sign in again.';

type CallData = typeof callData;

export interface ProfileRouterConfig {
  /** Read per request; null when CLERK_ISSUER is unset. */
  getAuthConfig: () => ClerkConfig | null;
  /** Read per request; null when the data function URL is unset. */
  getDataConfig: () => DataFunctionConfig | null;
  /** Overridable in tests. */
  callData?: CallData;
}

/** What the data function stores. The gateway answers with the shared `Profile` shape. */
interface StoredProfile {
  userId: string;
  senderName?: string;
  contactSource?: AccountContactSource;
  accountType: AccountType;
  createdAt: string;
  updatedAt: string;
}

function toProfile(stored: StoredProfile): Profile {
  return {
    id: stored.userId,
    senderName: stored.senderName ?? null,
    contactSource: stored.contactSource ?? null,
    accountType: stored.accountType,
    createdAt: stored.createdAt,
    updatedAt: stored.updatedAt,
  };
}

/** Returns the clean fields, or a calm message describing what is wrong (C8). */
export function parseProfileBody(body: unknown): { fields: ProfileUpdate } | { error: string } {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return { error: 'Send your details as a JSON object.' };
  }
  const input = body as Record<string, unknown>;
  const unknown = Object.keys(input).find((key) => !ALLOWED_KEYS.includes(key));
  if (unknown) return { error: 'Only your name and contact source can be saved.' };

  const fields: ProfileUpdate = {};
  if ('senderName' in input) {
    const name = input['senderName'];
    if (name !== null && (typeof name !== 'string' || [...name].length > MAX_SENDER_NAME_LENGTH)) {
      return { error: `Your name can be up to ${MAX_SENDER_NAME_LENGTH} characters.` };
    }
    fields.senderName = name as string | null;
  }
  if ('contactSource' in input) {
    const source = input['contactSource'];
    if (source !== null && source !== 'import' && source !== 'manual') {
      return { error: 'Contact source must be "import", "manual", or empty.' };
    }
    fields.contactSource = source;
  }
  return { fields };
}

/** GET/PUT /me/profile: the caller's own profile, read and written through the data function. */
export function createProfileRouter(config: ProfileRouterConfig) {
  const router = new Hono<{ Variables: ClerkAuthVariables }>();
  const call = config.callData ?? callData;

  router.use('/me/*', clerkAuth(config.getAuthConfig));

  /** Runs one action as the caller. Returns the result, or null if the data function is unreachable. */
  async function run(
    userToken: string,
    action: 'getProfile' | 'putProfile',
    args: Record<string, unknown>,
  ): Promise<DataResult<StoredProfile | null> | null> {
    const data = config.getDataConfig();
    if (!data) return null;
    try {
      return await call<StoredProfile | null>(data, userToken, action, args);
    } catch {
      return null;
    }
  }

  router.get('/me/profile', async (c) => {
    const result = await run(c.get('accessToken'), 'getProfile', {});
    if (!result) return c.json({ error: UNAVAILABLE }, 503);
    if (!result.ok) return result.code === 'not_found' ? c.json({ error: 'No profile yet.' }, 404) : failure(c, result.code);
    if (!result.data) return c.json({ error: 'No profile yet.' }, 404);
    return c.json(toProfile(result.data));
  });

  router.put('/me/profile', async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'Send your details as JSON.' }, 400);
    }
    const parsed = parseProfileBody(body);
    if ('error' in parsed) return c.json({ error: parsed.error }, 400);

    const result = await run(c.get('accessToken'), 'putProfile', { fields: parsed.fields });
    if (!result) return c.json({ error: UNAVAILABLE }, 503);
    if (!result.ok) return failure(c, result.code);
    if (!result.data) return c.json({ error: UNAVAILABLE }, 503);
    return c.json(toProfile(result.data));
  });

  return router;
}

/** Calm copy for every data failure (C8). The data function's own message is never forwarded. */
function failure(c: { json: (body: { error: string }, status: 400 | 401 | 503) => Response }, code: string): Response {
  if (code === 'unauthorized') return c.json({ error: SIGN_IN_AGAIN }, 401);
  if (code === 'invalid') return c.json({ error: 'Those details could not be saved.' }, 400);
  return c.json({ error: UNAVAILABLE }, 503);
}
