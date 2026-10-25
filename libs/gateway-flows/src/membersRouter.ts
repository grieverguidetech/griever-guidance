// Invite and member routes. Every route sits behind clerkAuth and calls the data function as the
// signed-in caller. Input is checked before any data call (C8); copy is calm (C7).
import { Hono, type Context } from 'hono';
import {
  callData,
  clerkAuth,
  type ClerkAuthVariables,
  type ClerkConfig,
  type DataFunctionConfig,
} from '@griever/gateway-auth';
import {
  INVITE_TOKEN_PATTERN,
  isUuid,
  parseInviteEmail,
  type DataResult,
  type MembersView,
  type PendingInvite,
} from '@griever/shared';
import { hashInviteToken, newInviteToken } from './inviteToken.js';
import { buildInviteLink, sendInviteEmail } from './mailer.js';

type CallData = typeof callData;
type Env = { Variables: ClerkAuthVariables };

// Same pattern the data function uses for a member id (a Clerk user id).
const MEMBER_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export interface MembersRouterConfig {
  /** Read per request; null when CLERK_ISSUER is unset. */
  getAuthConfig: () => ClerkConfig | null;
  /** Read per request; null when the data function URL is unset. */
  getDataConfig: () => DataFunctionConfig | null;
  /** Overridable in tests. */
  callData?: CallData;
  /** Read per request; any field may be unset. */
  getMail: () => { apiKey?: string; from?: string; webUrl?: string };
}

export const UNAVAILABLE = 'Invitations are not available right now. Please try again in a moment.';
export const SEND_FAILED = "The invitation couldn't be sent right now. Please try again in a moment.";
export const UNUSABLE = "This invitation can't be used. Ask the person who sent it for a new one.";
export const BAD_EMAIL = 'Enter a valid email address.';
export const BAD_BODY = 'Send the invitation as a JSON object with an email address.';
export const BAD_ID = 'That request could not be understood.';

type Failure = { status: 400 | 401 | 403 | 404 | 409 | 429 | 503; error: string };

const SIGN_IN_AGAIN = 'Please sign in again.';

/** What each data function failure says to the caller, outside accept. Unknown codes and busy are 503. */
export function failureFor(code: string): Failure {
  switch (code) {
    case 'invalid':
      return { status: 400, error: BAD_EMAIL };
    case 'unauthorized':
      return { status: 401, error: SIGN_IN_AGAIN };
    case 'forbidden':
      return { status: 403, error: 'Only the person who owns this account can do that.' };
    case 'not_found':
      return { status: 404, error: 'That could not be found.' };
    case 'conflict':
    case 'already_invited':
    case 'already_member':
    case 'invite_conflict':
      return { status: 409, error: 'That person is already invited or already helping.' };
    case 'rate_limited':
      return { status: 429, error: "You've sent a lot of invitations today. You can send more tomorrow." };
    default:
      return { status: 503, error: UNAVAILABLE };
  }
}

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
  const router = new Hono<Env>();
  const call = config.callData ?? callData;

  for (const path of ['/members', '/members/*', '/invites', '/invites/*']) {
    router.use(path, clerkAuth(config.getAuthConfig));
  }

  /** Runs one action as the caller. Returns the result, or null if the data function is unreachable. */
  async function run<T>(
    userToken: string,
    action: 'createInvite' | 'revokeInvite' | 'listMembers' | 'removeMember' | 'acceptInvite' | 'getProfile',
    args: Record<string, unknown>,
  ): Promise<DataResult<T> | null> {
    const data = config.getDataConfig();
    if (!data) {
      return null;
    }
    try {
      return await call<T>(data, userToken, action, args);
    } catch {
      return null;
    }
  }

  router.get('/members', async (c) => {
    const result = await run<MembersView>(c.get('accessToken'), 'listMembers', {});
    if (!result) {
      return c.json({ error: UNAVAILABLE }, 503);
    }
    if (!result.ok) {
      const { status, error } = failureFor(result.code);
      return c.json({ error }, status);
    }
    return c.json(result.data);
  });

  router.post('/invites', async (c) => {
    const body = await readObject(c.req.raw, ['email']);
    if (!body) {
      return c.json({ error: BAD_BODY }, 400);
    }
    const email = typeof body['email'] === 'string' ? parseInviteEmail(body['email']) : null;
    if (!email) {
      return c.json({ error: BAD_EMAIL }, 400);
    }

    // Without a way to send the email, no invite is made at all.
    const mail = config.getMail();
    if (!mail.apiKey || !mail.from || !mail.webUrl) {
      return c.json({ error: SEND_FAILED }, 503);
    }
    const userToken = c.get('accessToken');
    const token = newInviteToken();
    let link: string;
    try {
      link = buildInviteLink(mail.webUrl, token);
    } catch {
      return c.json({ error: SEND_FAILED }, 503);
    }

    const created = await run<PendingInvite>(userToken, 'createInvite', {
      email,
      tokenHash: await hashInviteToken(token),
    });
    if (!created) {
      return c.json({ error: UNAVAILABLE }, 503);
    }
    if (!created.ok) {
      const { status, error } = failureFor(created.code);
      return c.json({ error }, status);
    }
    const invite: PendingInvite = {
      id: created.data.id,
      email: created.data.email,
      expiresAt: created.data.expiresAt,
      createdAt: created.data.createdAt,
    };

    // From here on an open invite exists: any failure revokes it so none is left unsendable.
    const undo = async () => {
      // One retry; if both fail the invite expires on its own.
      for (let attempt = 0; attempt < 2; attempt++) {
        const revoked = await run<null>(userToken, 'revokeInvite', { id: invite.id });
        // Retry only when the answer was lost (null) or the data function was busy.
        if (revoked && (revoked.ok || revoked.code !== 'busy')) {
          break;
        }
      }
      return c.json({ error: SEND_FAILED }, 503);
    };

    const profile = await run<{ senderName?: string } | null>(userToken, 'getProfile', {});
    const ownerName = profile?.ok ? (profile.data?.senderName ?? null) : null;

    const sent = await sendInviteEmail({ apiKey: mail.apiKey, from: mail.from, to: email, ownerName, link });
    if (!sent.ok) {
      return undo();
    }

    return c.json(invite, 201);
  });

  router.post('/invites/accept', async (c) => {
    const unusable = () => c.json({ error: UNUSABLE }, 404);

    const body = await readObject(c.req.raw, ['token']);
    const token = body?.['token'];
    if (typeof token !== 'string' || !INVITE_TOKEN_PATTERN.test(token)) {
      return unusable();
    }

    const result = await run<{ ownerId: string }>(c.get('accessToken'), 'acceptInvite', {
      tokenHash: await hashInviteToken(token),
    });
    if (!result) {
      return c.json({ error: UNAVAILABLE }, 503);
    }
    if (result.ok) {
      return c.json({ ownerId: result.data.ownerId });
    }
    if (result.code === 'invite_conflict' || result.code === 'already_member' || result.code === 'conflict') {
      return c.json({ error: 'Your account already has people in it, so it cannot join another.' }, 409);
    }
    if (result.code === 'unauthorized') {
      return c.json({ error: SIGN_IN_AGAIN }, 401);
    }
    if (result.code === 'busy') {
      return c.json({ error: UNAVAILABLE }, 503);
    }
    // Every other cause looks the same to the caller, by design.
    return unusable();
  });

  const remove =
    (action: 'revokeInvite' | 'removeMember', param: 'id' | 'memberId') => async (c: Context<Env>) => {
      const id = c.req.param(param) ?? '';
      const valid = param === 'id' ? isUuid(id) : MEMBER_ID_PATTERN.test(id);
      if (!valid) {
        return c.json({ error: BAD_ID }, 400);
      }
      const result = await run<null>(c.get('accessToken'), action, { [param]: id });
      if (!result) {
        return c.json({ error: UNAVAILABLE }, 503);
      }
      if (!result.ok) {
        // Only POST /invites has an email to be invalid; here a bad request means a bad id.
        if (result.code === 'invalid') {
          return c.json({ error: BAD_ID }, 400);
        }
        const { status, error } = failureFor(result.code);
        return c.json({ error }, status);
      }
      return c.body(null, 204);
    };

  router.delete('/invites/:id', remove('revokeInvite', 'id'));
  router.delete('/members/:memberId', remove('removeMember', 'memberId'));

  return router;
}

/** The live router: env is read per request, so unset values mean 503, not a failed start. */
export const membersRouter = createMembersRouter({
  getAuthConfig: () => {
    const issuer = process.env['CLERK_ISSUER']?.trim();
    if (!issuer) {
      return null;
    }
    const authorizedParties = (process.env['CLERK_AUTHORIZED_PARTIES'] ?? '')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean);
    return { issuer, authorizedParties };
  },
  getDataConfig: () => {
    const url = process.env['DATA_FUNCTION_URL']?.trim();
    if (!url) {
      return null;
    }
    return {
      url,
      region: process.env['DATA_FUNCTION_REGION']?.trim(),
      accessKeyId: process.env['DATA_FUNCTION_ACCESS_KEY_ID'],
      secretAccessKey: process.env['DATA_FUNCTION_SECRET_ACCESS_KEY'],
    };
  },
  getMail: () => ({
    apiKey: process.env['RESEND_API_KEY'],
    from: process.env['INVITE_FROM_EMAIL'],
    webUrl: process.env['WEB_URL'],
  }),
});
