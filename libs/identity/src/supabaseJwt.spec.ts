import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import { clearJwksCache, supabaseAuth, type SupabaseAuthVariables } from './supabaseJwt.js';
import { SUPABASE_URL, USER_ID, jsonResponse, makeKeys, signJwt } from './testSupabase.js';

const CONFIG = { url: SUPABASE_URL, anonKey: 'anon' };

function buildApp(config: typeof CONFIG | null = CONFIG) {
  const app = new Hono<{ Variables: SupabaseAuthVariables }>();
  app.use('*', supabaseAuth(() => config));
  app.get('/who', (c) => c.json({ userId: c.get('userId'), token: c.get('accessToken') }));
  return app;
}

const bearer = (token: string) => ({ headers: { Authorization: `Bearer ${token}` } });

describe('supabaseAuth', () => {
  let keys: Awaited<ReturnType<typeof makeKeys>>;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    clearJwksCache();
    keys = await makeKeys();
    fetchMock = vi.fn().mockImplementation(async () => jsonResponse(keys.jwks));
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('accepts a valid token, uses sub as userId, and reads the JWKS URL', async () => {
    const token = await signJwt(keys.privateKey, keys.kid);
    const res = await buildApp().request('/who', bearer(token));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ userId: USER_ID, token });
    expect(fetchMock).toHaveBeenCalledWith(`${SUPABASE_URL}/auth/v1/.well-known/jwks.json`);
  });

  it('caches the JWKS between requests', async () => {
    const token = await signJwt(keys.privateKey, keys.kid);
    const app = buildApp();
    await app.request('/who', bearer(token));
    await app.request('/who', bearer(token));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('401 with no Authorization header', async () => {
    expect((await buildApp().request('/who')).status).toBe(401);
  });

  it('401 for a malformed token', async () => {
    expect((await buildApp().request('/who', bearer('not-a-jwt'))).status).toBe(401);
  });

  it('401 for an expired token', async () => {
    const past = Math.floor(Date.now() / 1000) - 7200;
    const token = await signJwt(keys.privateKey, keys.kid, { iat: past - 60, exp: past });
    expect((await buildApp().request('/who', bearer(token))).status).toBe(401);
  });

  it('401 for the wrong audience', async () => {
    const token = await signJwt(keys.privateKey, keys.kid, { aud: 'anon' });
    expect((await buildApp().request('/who', bearer(token))).status).toBe(401);
  });

  it('401 for a signature from a different key', async () => {
    const other = await makeKeys(keys.kid);
    const token = await signJwt(other.privateKey, keys.kid);
    expect((await buildApp().request('/who', bearer(token))).status).toBe(401);
  });

  it('401 for a kid that is not in the JWKS', async () => {
    const token = await signJwt(keys.privateKey, 'unknown-kid');
    expect((await buildApp().request('/who', bearer(token))).status).toBe(401);
  });

  it('401 for an HS256 token that uses the real kid (symmetric algorithms are refused)', async () => {
    const enc = (v: unknown) =>
      btoa(JSON.stringify(v)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const now = Math.floor(Date.now() / 1000);
    const signingInput = `${enc({ alg: 'HS256', typ: 'JWT', kid: keys.kid })}.${enc({
      sub: USER_ID,
      aud: 'authenticated',
      exp: now + 3600,
    })}`;
    const hmacKey = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode('anon'),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    const mac = new Uint8Array(await crypto.subtle.sign('HMAC', hmacKey, new TextEncoder().encode(signingInput)));
    const sig = btoa(String.fromCharCode(...mac)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const res = await buildApp().request('/who', bearer(`${signingInput}.${sig}`));
    expect(res.status).toBe(401);
  });

  it('401 for the wrong issuer', async () => {
    const token = await signJwt(keys.privateKey, keys.kid, { iss: 'https://evil.example/auth/v1' });
    expect((await buildApp().request('/who', bearer(token))).status).toBe(401);
  });

  it('401 for an issuer that is the bare project URL without /auth/v1', async () => {
    const token = await signJwt(keys.privateKey, keys.kid, { iss: SUPABASE_URL });
    expect((await buildApp().request('/who', bearer(token))).status).toBe(401);
  });

  it('401 for a validly signed token with no iss', async () => {
    const token = await signJwt(keys.privateKey, keys.kid, { iss: undefined });
    expect((await buildApp().request('/who', bearer(token))).status).toBe(401);
  });

  it('accepts the right issuer when SUPABASE_URL has a trailing slash', async () => {
    const token = await signJwt(keys.privateKey, keys.kid);
    const res = await buildApp({ url: `${SUPABASE_URL}/`, anonKey: 'anon' }).request('/who', bearer(token));
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(`${SUPABASE_URL}/auth/v1/.well-known/jwks.json`);
  });

  it('401 for a validly signed token with no sub', async () => {
    const token = await signJwt(keys.privateKey, keys.kid, { sub: undefined });
    expect((await buildApp().request('/who', bearer(token))).status).toBe(401);
  });

  it('401 for a validly signed token with no exp', async () => {
    const token = await signJwt(keys.privateKey, keys.kid, { exp: undefined });
    expect((await buildApp().request('/who', bearer(token))).status).toBe(401);
  });

  describe('key rotation', () => {
    afterEach(() => vi.useRealTimers());

    it('refetches once for an unknown kid and then accepts the new key', async () => {
      const app = buildApp();
      await app.request('/who', bearer(await signJwt(keys.privateKey, keys.kid))); // primes the cache
      const rotated = await makeKeys('key-2');
      fetchMock.mockImplementation(async () => jsonResponse({ keys: [...keys.jwks.keys, ...rotated.jwks.keys] }));

      const res = await app.request('/who', bearer(await signJwt(rotated.privateKey, 'key-2')));
      expect(res.status).toBe(200);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('does not refetch again for another unknown kid within 30 seconds', async () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      const app = buildApp();
      const stranger = await makeKeys('stranger');
      const token = await signJwt(stranger.privateKey, 'stranger');
      expect((await app.request('/who', bearer(token))).status).toBe(401); // load + forced refetch
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect((await app.request('/who', bearer(token))).status).toBe(401);
      expect(fetchMock).toHaveBeenCalledTimes(2);

      vi.advanceTimersByTime(31_000);
      expect((await app.request('/who', bearer(token))).status).toBe(401);
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it('shares one in-flight JWKS request between concurrent calls', async () => {
      const app = buildApp();
      const token = await signJwt(keys.privateKey, keys.kid);
      const results = await Promise.all([1, 2, 3].map(() => app.request('/who', bearer(token))));
      expect(results.map((r) => r.status)).toEqual([200, 200, 200]);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });

  it('503 (not 401) when the JWKS request fails', async () => {
    fetchMock.mockRejectedValue(new TypeError('network down'));
    const token = await signJwt(keys.privateKey, keys.kid);
    const res = await buildApp().request('/who', bearer(token));
    expect(res.status).toBe(503);
  });

  it('503 when the JWKS endpoint answers with an error status', async () => {
    fetchMock.mockResolvedValue(jsonResponse({}, 500));
    const token = await signJwt(keys.privateKey, keys.kid);
    expect((await buildApp().request('/who', bearer(token))).status).toBe(503);
  });

  it('503 when Supabase is not configured', async () => {
    const token = await signJwt(keys.privateKey, keys.kid);
    expect((await buildApp(null).request('/who', bearer(token))).status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
