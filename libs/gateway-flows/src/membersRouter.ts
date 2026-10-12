// Invite and member routes. Every route sits behind supabaseAuth and calls #117's SQL functions as
// the signed-in caller. Input is checked before any PostgREST call (C8); copy is calm (C7).
import { Hono, type Context } from 'hono';
import { supabaseAuth, type SupabaseAuthVariables, type SupabaseConfig } from '@griever/gateway-auth';
import { INVITE_TOKEN_PATTERN, isUuid, parseInviteEmail, type PendingInvite } from '@griever/shared';
import { hashInviteToken, newInviteToken } from './inviteToken.js';
import { buildInviteLink, sendInviteEmail } from './mailer.js';
import {
  acceptInvite,
  createInvite,
  getOwnName,
  listMembers,
  removeMember,
  revokeInvite,
  type MembersFailure,
} from './membersClient.js';

export interface MembersRouterConfig {
  /** Read per request; null when SUPABASE_URL / SUPABASE_ANON_KEY are unset. */
  getConfig: () => SupabaseConfig | null;
  /** Read per request; any field may be unset. */
  getMail: () => { apiKey?: string; from?: string; webUrl?: string };
}

const UNAVAILABLE = 'Invitations are not available right now. Please try again in a moment.';
const SEND_FAILED = "The invitation couldn't be sent right now. Please try again in a moment.";
const UNUSABLE = "This invitation can't be used. Ask the person who sent it for a new one.";
const BAD_EMAIL = 'Enter a valid email address.';
const BAD_BODY = 'Send the invitation as a JSON object with an email address.';
const BAD_ID = 'That request could not be understood.';

// What each PostgREST answer (PTnnn becomes HTTP nnn) says to the caller, outside accept.
const FAILURES: Record<MembersFailure, { status: 400 | 403 | 404 | 409 | 429; error: string }> = {
  invalid: { status: 400, error: BAD_EMAIL },
  forbidden: { status: 403, error: 'Only the person who owns this account can do that.' },
  not_found: { status: 404, error: 'That could not be found.' },
  conflict: { status: 409, error: 'That person is already invited or already helping.' },
  rate_limited: { status: 429, error: "You've sent a lot of invitations today. You can send more tomorrow." },
};

/** The body must be an object with exactly the allowed keys; returns it, or null. */
async function readObject(req: Request, allowed: string[]): Promise<Record<string, unknown> | null> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return null;
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return null;
  if (Object.keys(body).some((key) => !allowed.includes(key))) return null;
  return body as Record<string, unknown>;
}

export function createMembersRouter(config: MembersRouterConfig) {
  const router = new Hono<{ Variables: SupabaseAuthVariables }>();

  for (const path of ['/members', '/members/*', '/invites', '/invites/*']) {
    router.use(path, supabaseAuth(config.getConfig));
  }

  router.get('/members', async (c) => {
    const supabase = config.getConfig();
    if (!supabase) return c.json({ error: UNAVAILABLE }, 503);
    try {
      const result = await listMembers(supabase, c.get('accessToken'));
      if (!result.ok) {
        const { status, error } = FAILURES[result.reason];
        return c.json({ error }, status);
      }
      return c.json(result.value);
    } catch {
      return c.json({ error: UNAVAILABLE }, 503);
    }
  });

  router.post('/invites', async (c) => {
    const supabase = config.getConfig();
    if (!supabase) return c.json({ error: UNAVAILABLE }, 503);

    const body = await readObject(c.req.raw, ['email']);
    if (!body) return c.json({ error: BAD_BODY }, 400);
    const email = typeof body['email'] === 'string' ? parseInviteEmail(body['email']) : null;
    if (!email) return c.json({ error: BAD_EMAIL }, 400);

    // Without a way to send the email, no invite is made at all.
    const mail = config.getMail();
    if (!mail.apiKey || !mail.from || !mail.webUrl) return c.json({ error: SEND_FAILED }, 503);
    const jwt = c.get('accessToken');
    const token = newInviteToken();
    let link: string;
    try {
      link = buildInviteLink(mail.webUrl, token);
    } catch {
      return c.json({ error: SEND_FAILED }, 503);
    }

    let id: string;
    try {
      const created = await createInvite(supabase, jwt, email, await hashInviteToken(token));
      if (!created.ok) {
        const { status, error } = FAILURES[created.reason];
        return c.json({ error }, status);
      }
      id = created.value;
    } catch {
      return c.json({ error: UNAVAILABLE }, 503);
    }

    // From here on an open invite exists: any failure revokes it so none is left unsendable.
    const undo = async () => {
      try {
        await revokeInvite(supabase, jwt, id);
      } catch {
        // Nothing more can be done; the invite expires on its own.
      }
      return c.json({ error: SEND_FAILED }, 503);
    };

    let invite: PendingInvite | undefined;
    let ownerName: string | null = null;
    try {
      const list = await listMembers(supabase, jwt);
      if (list.ok && list.value.role === 'owner') invite = list.value.invites.find((i) => i.id === id);
      ownerName = await getOwnName(supabase, jwt).catch(() => null);
    } catch {
      return undo();
    }
    if (!invite) return undo();

    const sent = await sendInviteEmail({ apiKey: mail.apiKey, from: mail.from, to: email, ownerName, link });
    if (!sent.ok) return undo();

    return c.json(invite, 201);
  });

  // Registered before /invites/:id so "accept" is never read as an id.
  router.post('/invites/accept', async (c) => {
    const supabase = config.getConfig();
    if (!supabase) return c.json({ error: UNAVAILABLE }, 503);
    const unusable = () => c.json({ error: UNUSABLE }, 404);

    const body = await readObject(c.req.raw, ['token']);
    const token = body?.['token'];
    if (typeof token !== 'string' || !INVITE_TOKEN_PATTERN.test(token)) return unusable();

    try {
      const result = await acceptInvite(supabase, c.get('accessToken'), await hashInviteToken(token));
      if (result.ok) return c.json({ ownerId: result.value });
      if (result.reason === 'conflict') {
        return c.json({ error: 'Your account already has people in it, so it cannot join another.' }, 409);
      }
      return unusable();
    } catch {
      return c.json({ error: UNAVAILABLE }, 503);
    }
  });

  const remove = (
    call: (supabase: SupabaseConfig, jwt: string, id: string) => ReturnType<typeof revokeInvite>,
    param: 'id' | 'memberId',
  ) =>
    async (c: Context<{ Variables: SupabaseAuthVariables }>) => {
      const supabase = config.getConfig();
      if (!supabase) return c.json({ error: UNAVAILABLE }, 503);
      const id = c.req.param(param) ?? '';
      if (!isUuid(id)) return c.json({ error: BAD_ID }, 400);
      try {
        const result = await call(supabase, c.get('accessToken'), id);
        if (!result.ok) {
          const { status, error } = FAILURES[result.reason];
          return c.json({ error }, status);
        }
        return c.body(null, 204);
      } catch {
        return c.json({ error: UNAVAILABLE }, 503);
      }
    };

  router.delete('/invites/:id', remove(revokeInvite, 'id'));
  router.delete('/members/:memberId', remove(removeMember, 'memberId'));

  return router;
}

/** The live router: env is read per request, so unset values mean 503, not a failed start. */
export const membersRouter = createMembersRouter({
  getConfig: () => {
    const url = process.env['SUPABASE_URL'];
    const anonKey = process.env['SUPABASE_ANON_KEY'];
    return url && anonKey ? { url: url.replace(/\/+$/, ''), anonKey } : null;
  },
  getMail: () => ({
    apiKey: process.env['RESEND_API_KEY'],
    from: process.env['INVITE_FROM_EMAIL'],
    webUrl: process.env['WEB_URL'],
  }),
});
