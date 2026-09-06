import { Hono } from 'hono';
import type { OAuthProvider } from './oauthProvider.js';
import { signToken, verifyToken } from './token.js';
import { hashPassword, verifyPassword } from './password.js';
import {
  findOrCreateIdentity,
  getIdentityAndProfile,
  signUpWithPassword,
  getPasswordCredential,
} from './identityFunctions.js';

const MIN_PASSWORD_LENGTH = 8;
const GENERIC_SIGNIN_ERROR = 'Incorrect email or password.';

const STATE_TTL_SECONDS = 10 * 60; // long enough to pick a Facebook/Instagram account, short if leaked
const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days

/**
 * The slice of ConvexHttpClient this router actually calls — small enough to
 * fake in tests. `any` rather than `unknown` on purpose: ConvexHttpClient's
 * real `query`/`mutation` are generic over a `FunctionReference`, and a
 * narrower parameter type here isn't structurally assignable from it.
 */
export interface ConvexLike {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query: (ref: any, args: Record<string, unknown>) => Promise<unknown>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mutation: (ref: any, args: Record<string, unknown>) => Promise<unknown>;
}

export interface IdentityRouterConfig {
  providers: Record<string, OAuthProvider>;
  getConvexClient: () => ConvexLike | null;
  sessionSecret: string | undefined;
  serviceSecret: string | undefined;
  gatewayBaseUrl: string | undefined;
  /** Origins `redirectTo` is allowed to point at — apps/web's own origin(s), reuse CORS_ORIGINS. */
  allowedRedirectOrigins: string[];
}

function isAllowedRedirect(redirectTo: string, allowedOrigins: string[]): boolean {
  try {
    return allowedOrigins.includes(new URL(redirectTo).origin);
  } catch {
    return false;
  }
}

/**
 * Sign up / sign in with Facebook or Instagram. This is identity only — who
 * the person is — never a friends list or a way to message anyone; see
 * CLAUDE.md. A signed, short-lived `state` carries `redirectTo` across the
 * round trip to the provider and back, so no server-side session is needed
 * between `/start` and `/callback`; the session itself is a signed bearer
 * token handed back in the callback redirect's URL fragment (never a query
 * string or a cookie — a fragment never reaches the gateway's own logs, and
 * a cross-site cookie between the gateway's and web's separate origins
 * would need `SameSite=None; Secure`, which breaks on plain-HTTP local dev).
 */
export function createIdentityRouter(config: IdentityRouterConfig) {
  const router = new Hono();

  router.get('/auth/:provider/start', async (c) => {
    const provider = config.providers[c.req.param('provider')];
    if (!provider) return c.json({ error: 'That sign-in option is not available.' }, 404);
    if (!config.sessionSecret || !config.gatewayBaseUrl) {
      return c.json({ error: 'Sign-in is not configured.' }, 500);
    }
    const redirectTo = c.req.query('redirectTo');
    if (!redirectTo) {
      return c.json({ error: "querystring must have required property 'redirectTo'" }, 400);
    }
    // Checked here, before anything is signed — this is the one point an
    // attacker controls `redirectTo`'s value; a validly-signed state for an
    // attacker's own origin would otherwise carry a real session token
    // straight to them once the callback redirects there.
    if (!isAllowedRedirect(redirectTo, config.allowedRedirectOrigins)) {
      return c.json({ error: 'That redirect destination is not allowed.' }, 400);
    }

    const state = await signToken({ provider: provider.id, redirectTo }, config.sessionSecret, STATE_TTL_SECONDS);
    const callbackUrl = `${config.gatewayBaseUrl}/auth/${provider.id}/callback`;
    return c.redirect(provider.authorizationUrl({ state, redirectUri: callbackUrl }));
  });

  router.get('/auth/:provider/callback', async (c) => {
    const provider = config.providers[c.req.param('provider')];
    if (!provider) return c.json({ error: 'That sign-in option is not available.' }, 404);
    if (!config.sessionSecret || !config.serviceSecret || !config.gatewayBaseUrl) {
      return c.json({ error: 'Sign-in is not configured.' }, 500);
    }
    const code = c.req.query('code');
    const stateRaw = c.req.query('state');
    if (!code || !stateRaw) return c.json({ error: 'Missing code or state.' }, 400);

    const state = await verifyToken<{ provider: string; redirectTo: string; exp: number }>(
      stateRaw,
      config.sessionSecret,
    );
    if (!state || state.provider !== provider.id) {
      return c.json({ error: 'This sign-in link has expired. Please try again.' }, 400);
    }

    const client = config.getConvexClient();
    if (!client) return c.json({ error: 'Sign-in is not configured.' }, 500);

    const redirect = new URL(state.redirectTo);
    try {
      const callbackUrl = `${config.gatewayBaseUrl}/auth/${provider.id}/callback`;
      const { accessToken, extra } = await provider.exchangeCode({ code, redirectUri: callbackUrl });
      const profile = await provider.fetchProfile({ accessToken, extra });

      const result = (await client.mutation(findOrCreateIdentity, {
        serviceSecret: config.serviceSecret,
        authProvider: provider.id,
        providerSub: profile.providerSub,
        email: profile.email,
        emailVerified: profile.emailVerified,
      })) as { userId: string; isNewIdentity: boolean };

      const sessionToken = await signToken({ userId: result.userId }, config.sessionSecret, SESSION_TTL_SECONDS);
      redirect.hash = `token=${encodeURIComponent(sessionToken)}&isNew=${result.isNewIdentity}`;
      return c.redirect(redirect.toString());
    } catch (err) {
      console.error(err);
      redirect.hash = 'error=sign_in_failed';
      return c.redirect(redirect.toString());
    }
  });

  router.get('/auth/session', async (c) => {
    if (!config.sessionSecret || !config.serviceSecret) {
      return c.json({ error: 'Sign-in is not configured.' }, 500);
    }
    const authHeader = c.req.header('authorization') ?? '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : null;
    if (!token) return c.json({ error: 'Not signed in.' }, 401);

    const payload = await verifyToken<{ userId: string; exp: number }>(token, config.sessionSecret);
    if (!payload) return c.json({ error: 'Not signed in.' }, 401);

    const client = config.getConvexClient();
    if (!client) return c.json({ error: 'Sign-in is not configured.' }, 500);

    const identity = await client.query(getIdentityAndProfile, {
      serviceSecret: config.serviceSecret,
      userId: payload.userId,
    });
    if (!identity) return c.json({ error: 'Not signed in.' }, 401);
    return c.json(identity);
  });

  // The session is a stateless bearer token — there is nothing server-side
  // to revoke yet. Kept as a real route (rather than left client-only) so
  // adding revocation later doesn't change the API shape apps/web calls.
  router.post('/auth/signout', (c) => c.json({ ok: true }));

  router.post('/auth/password/signup', async (c) => {
    if (!config.sessionSecret || !config.serviceSecret) {
      return c.json({ error: 'Sign-in is not configured.' }, 500);
    }
    const body = await c.req.json().catch(() => null);
    const email = typeof body?.email === 'string' ? body.email.trim() : '';
    const password = typeof body?.password === 'string' ? body.password : '';
    const senderName = typeof body?.senderName === 'string' ? body.senderName.trim() : '';
    if (!email || !senderName) {
      return c.json({ error: 'Name and email are required.' }, 400);
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      return c.json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` }, 400);
    }

    const client = config.getConvexClient();
    if (!client) return c.json({ error: 'Sign-in is not configured.' }, 500);

    try {
      const { hash, salt } = await hashPassword(password);
      const result = (await client.mutation(signUpWithPassword, {
        serviceSecret: config.serviceSecret,
        email,
        passwordHash: hash,
        passwordSalt: salt,
        senderName,
      })) as { userId: string; isNewIdentity: boolean };

      const sessionToken = await signToken({ userId: result.userId }, config.sessionSecret, SESSION_TTL_SECONDS);
      return c.json({ token: sessionToken, userId: result.userId, isNewIdentity: result.isNewIdentity }, 201);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not create an account.';
      // The only error signUpWithPassword ever throws is the duplicate-email
      // case — safe to surface verbatim, unlike the OAuth callback's catch.
      return c.json({ error: message }, 409);
    }
  });

  router.post('/auth/password/signin', async (c) => {
    if (!config.sessionSecret || !config.serviceSecret) {
      return c.json({ error: 'Sign-in is not configured.' }, 500);
    }
    const body = await c.req.json().catch(() => null);
    const email = typeof body?.email === 'string' ? body.email.trim() : '';
    const password = typeof body?.password === 'string' ? body.password : '';
    if (!email || !password) {
      return c.json({ error: GENERIC_SIGNIN_ERROR }, 401);
    }

    const client = config.getConvexClient();
    if (!client) return c.json({ error: 'Sign-in is not configured.' }, 500);

    const credential = (await client.query(getPasswordCredential, {
      serviceSecret: config.serviceSecret,
      email,
    })) as { userId: string; passwordHash: string; passwordSalt: string } | null;
    if (!credential) return c.json({ error: GENERIC_SIGNIN_ERROR }, 401);

    const valid = await verifyPassword(password, credential.passwordHash, credential.passwordSalt);
    if (!valid) return c.json({ error: GENERIC_SIGNIN_ERROR }, 401);

    const sessionToken = await signToken({ userId: credential.userId }, config.sessionSecret, SESSION_TTL_SECONDS);
    return c.json({ token: sessionToken, userId: credential.userId, isNewIdentity: false });
  });

  return router;
}
