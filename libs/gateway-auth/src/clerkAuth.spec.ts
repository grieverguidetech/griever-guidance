import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import { Jwt } from 'hono/utils/jwt';
import { clearClerkCache, clerkAuth, type ClerkAuthVariables, type ClerkConfig } from './clerkAuth.js';

const ISSUER = 'https://clerk.example.test';
const JWKS_URL = `${ISSUER}/.well-known/jwks.json`;
const ORIGIN = 'https://app.example.test';

async function makeKey(kid: string) {
  const pair = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  );
  const privateJwk = { ...(await crypto.subtle.exportKey('jwk', pair.privateKey)), kid, alg: 'RS256' };
  const publicJwk = { ...(await crypto.subtle.exportKey('jwk', pair.publicKey)), kid, alg: 'RS256' };
  return { privateJwk, publicJwk };
}

const nowSeconds = () => Math.floor(Date.now() / 1000);
const goodClaims = (): Record<string, unknown> => ({
  sub: 'user_abc123',
  iss: ISSUER,
  azp: ORIGIN,
  exp: nowSeconds() + 300,
  email: 'pat@example.test',
  email_verified: true,
});

describe('clerkAuth', () => {
  let key: Awaited<ReturnType<typeof makeKey>>;
  let config: ClerkConfig | null;
  let jwksStatus: number;
  const fetchStub = vi.fn();

  const app = new Hono<{ Variables: ClerkAuthVariables }>();
  app.use('*', clerkAuth(() => config));
  app.get('/who', (c) => c.json({ userId: c.get('userId'), token: c.get('accessToken') }));

  const sign = (claims: Record<string, unknown>) =>
    Jwt.sign(claims, key.privateJwk, 'RS256');
  const call = (token?: string) =>
    app.request('/who', { headers: token ? { Authorization: `Bearer ${token}` } : {} });

  beforeEach(async () => {
    key = await makeKey('k1');
    config = { issuer: ISSUER, authorizedParties: [ORIGIN] };
    jwksStatus = 200;
    fetchStub.mockReset();
    fetchStub.mockImplementation(async (url: string) => {
      expect(url).toBe(JWKS_URL);
      return jwksStatus === 200
        ? new Response(JSON.stringify({ keys: [key.publicJwk] }), { status: 200 })
        : new Response('nope', { status: jwksStatus });
    });
    vi.stubGlobal('fetch', fetchStub);
    clearClerkCache();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('accepts a good token and exposes sub as userId', async () => {
    const token = await sign(goodClaims());
    const res = await call(token);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ userId: 'user_abc123', token });
  });

  it('accepts a token with no azp', async () => {
    const { azp: _azp, ...claims } = goodClaims();
    expect((await call(await sign(claims))).status).toBe(200);
  });

  it('accepts a token that expired 4 s ago (leeway) and refuses one that expired 6 s ago', async () => {
    expect((await call(await sign({ ...goodClaims(), exp: nowSeconds() - 4 }))).status).toBe(200);
    expect((await call(await sign({ ...goodClaims(), exp: nowSeconds() - 6 }))).status).toBe(401);
  });

  it.each([
    ['wrong issuer', { iss: 'https://evil.example.test' }],
    ['wrong azp', { azp: 'https://evil.example.test' }],
    ['missing email', { email: undefined }],
    ['missing sub', { sub: undefined }],
    ['missing exp', { exp: undefined }],
  ])('answers 401 for %s', async (_label, change) => {
    const res = await call(await sign({ ...goodClaims(), ...change }));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Please sign in again.' });
  });

  it('answers 401 for no header, a non-bearer header, garbage, and a foreign signature', async () => {
    expect((await call()).status).toBe(401);
    const basic = await app.request('/who', { headers: { Authorization: 'Basic abc' } });
    expect(basic.status).toBe(401);
    expect((await call('not.a.jwt')).status).toBe(401);
    const other = await makeKey('k1');
    const forged = await Jwt.sign(goodClaims(), other.privateJwk, 'RS256');
    expect((await call(forged)).status).toBe(401);
  });

  it('answers 503 when the key list cannot be fetched on a cold start', async () => {
    jwksStatus = 500;
    const res = await call(await sign(goodClaims()));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: 'Accounts are not available right now.' });
  });

  it('answers 503 when the network fails', async () => {
    fetchStub.mockRejectedValue(new TypeError('network'));
    expect((await call(await sign(goodClaims()))).status).toBe(503);
  });

  it('answers 503 when CLERK_ISSUER is unset', async () => {
    config = null;
    expect((await call(await sign(goodClaims()))).status).toBe(503);
    expect(fetchStub).not.toHaveBeenCalled();
  });

  it('ignores a trailing slash on the issuer', async () => {
    config = { issuer: `${ISSUER}/`, authorizedParties: [ORIGIN] };
    expect((await call(await sign(goodClaims()))).status).toBe(200);
  });

  it('fetches the keys once for repeated requests', async () => {
    await call(await sign(goodClaims()));
    await call(await sign(goodClaims()));
    expect(fetchStub).toHaveBeenCalledTimes(1);
  });
});
