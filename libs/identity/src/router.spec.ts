import { describe, expect, it, vi } from 'vitest';
import { createIdentityRouter, type ConvexLike } from './router.js';
import { signToken } from './token.js';
import type { OAuthProvider } from './oauthProvider.js';

const SESSION_SECRET = 'session-secret';
const SERVICE_SECRET = 'service-secret';
const GATEWAY_BASE_URL = 'https://gw.example';
const ALLOWED_ORIGIN = 'https://app.example';

function fakeProvider(overrides: Partial<OAuthProvider> = {}): OAuthProvider {
  return {
    id: 'facebook',
    authorizationUrl: ({ state }) => `https://provider.example/authorize?state=${state}`,
    exchangeCode: vi.fn().mockResolvedValue({ accessToken: 'tok' }),
    fetchProfile: vi.fn().mockResolvedValue({
      providerSub: 'sub1',
      email: 'a@example.com',
      emailVerified: true,
      name: 'Ada',
    }),
    ...overrides,
  };
}

function buildRouter(opts: {
  providers?: Record<string, OAuthProvider>;
  convex?: ConvexLike | null;
} = {}) {
  const convex: ConvexLike = opts.convex ?? {
    mutation: vi.fn().mockResolvedValue({ userId: 'usr_1', isNewIdentity: true }),
    query: vi.fn().mockResolvedValue({
      userId: 'usr_1',
      authProvider: 'facebook',
      email: 'a@example.com',
      emailVerified: true,
      senderName: null,
      contactSource: 'import',
      checklistTicks: [],
    }),
  };
  const router = createIdentityRouter({
    providers: opts.providers ?? { facebook: fakeProvider() },
    getConvexClient: () => convex,
    sessionSecret: SESSION_SECRET,
    serviceSecret: SERVICE_SECRET,
    gatewayBaseUrl: GATEWAY_BASE_URL,
    allowedRedirectOrigins: [ALLOWED_ORIGIN],
  });
  return { router, convex };
}

describe('GET /auth/:provider/start', () => {
  it('404s for a provider that is not registered', async () => {
    const { router } = buildRouter({ providers: {} });
    const res = await router.request(`/auth/facebook/start?redirectTo=${ALLOWED_ORIGIN}`);
    expect(res.status).toBe(404);
  });

  it('400s with no redirectTo', async () => {
    const { router } = buildRouter();
    const res = await router.request('/auth/facebook/start');
    expect(res.status).toBe(400);
  });

  it('refuses a redirectTo whose origin is not allowlisted (open-redirect guard)', async () => {
    const { router } = buildRouter();
    const res = await router.request('/auth/facebook/start?redirectTo=https://evil.example/steal');
    expect(res.status).toBe(400);
  });

  it('redirects to the provider with a signed state carrying the redirectTo', async () => {
    const { router } = buildRouter();
    const res = await router.request(`/auth/facebook/start?redirectTo=${encodeURIComponent(ALLOWED_ORIGIN)}`, {
      redirect: 'manual',
    });
    expect(res.status).toBe(302);
    const location = new URL(res.headers.get('location') as string);
    expect(location.origin).toBe('https://provider.example');
    expect(location.searchParams.get('state')).toBeTruthy();
  });
});

describe('GET /auth/:provider/callback', () => {
  it('400s with no code or state', async () => {
    const { router } = buildRouter();
    const res = await router.request('/auth/facebook/callback');
    expect(res.status).toBe(400);
  });

  it('400s on an invalid/expired state', async () => {
    const { router } = buildRouter();
    const res = await router.request('/auth/facebook/callback?code=abc&state=garbage');
    expect(res.status).toBe(400);
  });

  it('exchanges the code, finds/creates the identity, and redirects with a session token', async () => {
    const { router, convex } = buildRouter();
    const state = await signToken({ provider: 'facebook', redirectTo: ALLOWED_ORIGIN }, SESSION_SECRET, 600);
    const res = await router.request(`/auth/facebook/callback?code=abc&state=${encodeURIComponent(state)}`, {
      redirect: 'manual',
    });
    expect(res.status).toBe(302);
    const location = new URL(res.headers.get('location') as string);
    expect(location.origin).toBe(ALLOWED_ORIGIN);
    const hashParams = new URLSearchParams(location.hash.slice(1));
    expect(hashParams.get('token')).toBeTruthy();
    expect(hashParams.get('isNew')).toBe('true');
    expect(convex.mutation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ serviceSecret: SERVICE_SECRET, providerSub: 'sub1' }),
    );
  });

  it('redirects back with an error hash if the provider exchange throws, rather than leaking the failure', async () => {
    const provider = fakeProvider({ exchangeCode: vi.fn().mockRejectedValue(new Error('boom')) });
    const { router } = buildRouter({ providers: { facebook: provider } });
    const state = await signToken({ provider: 'facebook', redirectTo: ALLOWED_ORIGIN }, SESSION_SECRET, 600);
    const res = await router.request(`/auth/facebook/callback?code=abc&state=${encodeURIComponent(state)}`, {
      redirect: 'manual',
    });
    expect(res.status).toBe(302);
    const location = new URL(res.headers.get('location') as string);
    expect(location.hash).toBe('#error=sign_in_failed');
  });
});

describe('GET /auth/session', () => {
  it('401s with no bearer token', async () => {
    const { router } = buildRouter();
    const res = await router.request('/auth/session');
    expect(res.status).toBe(401);
  });

  it('401s with a token signed by a different secret', async () => {
    const { router } = buildRouter();
    const token = await signToken({ userId: 'usr_1' }, 'wrong-secret', 600);
    const res = await router.request('/auth/session', { headers: { authorization: `Bearer ${token}` } });
    expect(res.status).toBe(401);
  });

  it('returns the identity for a valid session token', async () => {
    const { router } = buildRouter();
    const token = await signToken({ userId: 'usr_1' }, SESSION_SECRET, 600);
    const res = await router.request('/auth/session', { headers: { authorization: `Bearer ${token}` } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.userId).toBe('usr_1');
  });
});
