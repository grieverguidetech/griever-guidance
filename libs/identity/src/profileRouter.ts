import { Hono } from 'hono';
import { supabaseAuth, type SupabaseAuthVariables, type SupabaseConfig } from '@griever/gateway-auth';
import { createProfilesClient, type ProfileFields, type ProfilesClient } from './supabaseClient.js';

const MAX_SENDER_NAME_LENGTH = 100;
const ALLOWED_KEYS = ['senderName', 'contactSource'];
// Any PostgREST failure (403, 5xx, network) is reported as 503: from the user's side the
// answer is the same, try again later. The gateway never sends a write RLS would refuse.
const UNAVAILABLE = 'Your details could not be reached right now. Please try again in a moment.';

export interface ProfileRouterConfig {
  /** Read per request; null when SUPABASE_URL / SUPABASE_ANON_KEY are unset. */
  getConfig: () => SupabaseConfig | null;
  /** Overridable in tests. */
  createClient?: (config: SupabaseConfig, accessToken: string) => ProfilesClient;
}

/** Returns the clean fields, or a calm message describing what is wrong (C8). */
export function parseProfileBody(body: unknown): { fields: ProfileFields } | { error: string } {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return { error: 'Send your details as a JSON object.' };
  }
  const input = body as Record<string, unknown>;
  const unknown = Object.keys(input).find((key) => !ALLOWED_KEYS.includes(key));
  if (unknown) return { error: 'Only your name and contact source can be saved.' };

  const fields: ProfileFields = {};
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

/** GET/PUT /me/profile: the caller's own row, read and written under RLS. */
export function createProfileRouter(config: ProfileRouterConfig) {
  const router = new Hono<{ Variables: SupabaseAuthVariables }>();
  const makeClient = config.createClient ?? createProfilesClient;

  router.use('/me/*', supabaseAuth(config.getConfig));

  router.get('/me/profile', async (c) => {
    const supabase = config.getConfig();
    if (!supabase) return c.json({ error: UNAVAILABLE }, 503);
    try {
      const profile = await makeClient(supabase, c.get('accessToken')).get(c.get('userId'));
      if (!profile) return c.json({ error: 'No profile yet.' }, 404);
      return c.json(profile);
    } catch {
      return c.json({ error: UNAVAILABLE }, 503);
    }
  });

  router.put('/me/profile', async (c) => {
    const supabase = config.getConfig();
    if (!supabase) return c.json({ error: UNAVAILABLE }, 503);

    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'Send your details as JSON.' }, 400);
    }
    const parsed = parseProfileBody(body);
    if ('error' in parsed) return c.json({ error: parsed.error }, 400);

    try {
      const profile = await makeClient(supabase, c.get('accessToken')).upsert(c.get('userId'), parsed.fields);
      return c.json(profile);
    } catch {
      return c.json({ error: UNAVAILABLE }, 503);
    }
  });

  return router;
}
