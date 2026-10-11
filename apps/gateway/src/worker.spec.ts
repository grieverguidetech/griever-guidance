/**
 * Integration tests for the composed gateway: the real Hono app from
 * worker.ts with identity, messages and sync mounted, exercised over HTTP via
 * `app.request`. No Convex, no network — routes are driven to their
 * validation and "not configured" branches, and Anthropic is a stubbed fetch.
 */
// ES256 test tokens via WebCrypto (the same approach as libs/identity's specs; kept local so
// this app does not import another project's source by relative path).
const USER_ID = '11111111-1111-4111-8111-111111111111';
const b64url = (data: ArrayBuffer | string): string => {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : new Uint8Array(data);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
async function makeKeys(kid = 'key-1') {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const publicJwk = { ...(await crypto.subtle.exportKey('jwk', pair.publicKey)), kid, alg: 'ES256', use: 'sig' };
  return { privateKey: pair.privateKey, jwks: { keys: [publicJwk] }, kid };
}
async function signJwt(privateKey: Awaited<ReturnType<typeof makeKeys>>['privateKey'], kid: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'ES256', typ: 'JWT', kid }));
  const payload = b64url(JSON.stringify({ sub: USER_ID, aud: 'authenticated', iat: now, exp: now + 3600 }));
  const sig = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    privateKey,
    new TextEncoder().encode(`${header}.${payload}`),
  );
  return `${header}.${payload}.${b64url(sig)}`;
}
const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const WEB_ORIGIN = 'https://web.grieversguidance.com';

async function loadApp(env: Record<string, string | undefined> = {}) {
  vi.resetModules();
  vi.unstubAllEnvs();
  vi.stubEnv('CORS_ORIGINS', `${WEB_ORIGIN}, http://localhost:5173`);
  vi.stubEnv('CONVEX_URL', '');
  vi.stubEnv('CONVEX_SELF_HOSTED_URL', '');
  vi.stubEnv('ANTHROPIC_API_KEY', '');
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value ?? '');
  // Under nodenext the CJS-typed module nests its default export one level deeper than Vite
  // actually delivers it; the cast restores the real shape (the Hono app).
  const mod = await import('./worker.js');
  return mod.default as unknown as typeof mod.default.default;
}

const json = (body: unknown) => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('gateway: health and CORS', () => {
  it('answers /health', async () => {
    const app = await loadApp();
    const res = await app.request('/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('echoes an allowed origin', async () => {
    const app = await loadApp();
    const res = await app.request('/health', { headers: { Origin: WEB_ORIGIN } });
    expect(res.headers.get('access-control-allow-origin')).toBe(WEB_ORIGIN);
  });

  it('sends no CORS header for an unlisted origin', async () => {
    const app = await loadApp();
    const res = await app.request('/health', { headers: { Origin: 'https://evil.example' } });
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('has no allow-all mode when CORS_ORIGINS is empty', async () => {
    const app = await loadApp({ CORS_ORIGINS: '' });
    const res = await app.request('/health', { headers: { Origin: WEB_ORIGIN } });
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('answers preflight for allowed origins with GET, POST and PUT only', async () => {
    const app = await loadApp();
    const res = await app.request('/sync/push', {
      method: 'OPTIONS',
      headers: { Origin: WEB_ORIGIN, 'Access-Control-Request-Method': 'POST' },
    });
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-methods')).toBe('GET,POST,PUT');
  });
});

describe('gateway: every route validates its input (REQUIREMENTS C8)', () => {
  it('sync/pull requires a cursor', async () => {
    const app = await loadApp();
    expect((await app.request('/sync/pull')).status).toBe(400);
  });

  it.each([null, {}, { deviceId: '', ops: [] }, { deviceId: 'd1', ops: 'nope' }])(
    'sync/push rejects %j',
    async (body) => {
      const app = await loadApp();
      expect((await app.request('/sync/push', json(body))).status).toBe(400);
    },
  );

  it('sync/push rejects a body that is not JSON', async () => {
    const app = await loadApp();
    const res = await app.request('/sync/push', { method: 'POST', body: 'not json' });
    expect(res.status).toBe(400);
  });

  it.each([{}, { fullName: 'A', dateOfBirth: '', dateOfPassing: '2' }])('obituary rejects %j', async (body) => {
    const app = await loadApp({ ANTHROPIC_API_KEY: 'test-key' });
    expect((await app.request('/obituary', json(body))).status).toBe(400);
  });
});

describe('gateway: the removed /auth routes', () => {
  it('no longer exist', async () => {
    const app = await loadApp();
    expect((await app.request('/auth/session')).status).toBe(404);
    expect((await app.request('/auth/password/signin', json({ email: 'a@b.c', password: 'longenough1' }))).status).toBe(404);
  });
});

describe('gateway: unconfigured services fail closed with a plain message', () => {
  it('sync without Convex', async () => {
    const app = await loadApp();
    const res = await app.request('/sync/pull?cursor=0');
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Sync is not configured.' });
  });

  it('obituary without an Anthropic key', async () => {
    const app = await loadApp();
    const res = await app.request('/obituary', json({ fullName: 'A', dateOfBirth: '1', dateOfPassing: '2' }));
    expect(res.status).toBe(500);
  });
});

describe('gateway: obituary drafting', () => {
  const request = {
    fullName: 'Margaret Hayes',
    dateOfBirth: 'March 2, 1941',
    dateOfPassing: 'May 29, 2026',
    survivors: 'her children',
  };

  it('asks for a calm draft from only the facts given and returns it', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ content: [{ type: 'text', text: 'Margaret Hayes, 85, ' }, { type: 'text', text: 'died.' }] })),
    );
    vi.stubGlobal('fetch', fetchMock);
    const app = await loadApp({ ANTHROPIC_API_KEY: 'test-key' });

    const res = await app.request('/obituary', json(request));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ draft: 'Margaret Hayes, 85, died.' });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    const prompt: string = JSON.parse(init.body).messages[0].content;
    expect(prompt).toContain('Do not use exclamation points');
    expect(prompt).toContain('Do not add information that was not provided');
    expect(prompt).toContain('Survived by: her children');
    expect(prompt).not.toContain('Career');
  });

  it('returns 502 when the model call fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 529 })));
    const app = await loadApp({ ANTHROPIC_API_KEY: 'test-key' });
    expect((await app.request('/obituary', json(request))).status).toBe(502);
  });
});

describe('gateway: /me/profile (Supabase accounts)', () => {
  const SUPABASE_URL = 'https://proj.supabase.test';
  const ENV = { SUPABASE_URL, SUPABASE_ANON_KEY: 'anon-key' };
  const ROW = {
    id: USER_ID,
    sender_name: 'Ada',
    contact_source: null,
    created_at: '2026-10-11T10:00:00+00:00',
    updated_at: '2026-10-11T10:00:00+00:00',
  };

  // Stubs the JWKS and PostgREST; anything else is a test bug.
  function stubSupabase(keys: Awaited<ReturnType<typeof makeKeys>>, postgrest: () => Response) {
    const fetchMock = vi.fn(async (url: string, _init?: { headers: Record<string, string> }) => {
      if (url.endsWith('/auth/v1/.well-known/jwks.json')) return jsonResponse(keys.jwks);
      if (url.includes('/rest/v1/profiles')) return postgrest();
      throw new Error(`unexpected fetch ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }

  async function setup(postgrest: () => Response = () => jsonResponse([ROW])) {
    const keys = await makeKeys();
    const token = await signJwt(keys.privateKey, keys.kid);
    const fetchMock = stubSupabase(keys, postgrest);
    const app = await loadApp(ENV);
    const auth = { Authorization: `Bearer ${token}` };
    return { app, auth, token, fetchMock };
  }
  const put = (auth: Record<string, string>, body: unknown) => ({
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...auth },
    body: JSON.stringify(body),
  });

  it('401 without a token', async () => {
    const { app } = await setup();
    expect((await app.request('/me/profile')).status).toBe(401);
  });

  it('GET 200 returns the camelCase profile, read as the caller', async () => {
    const { app, auth, token, fetchMock } = await setup();
    const res = await app.request('/me/profile', { headers: auth });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      id: USER_ID,
      senderName: 'Ada',
      contactSource: null,
      createdAt: '2026-10-11T10:00:00.000Z',
      updatedAt: '2026-10-11T10:00:00.000Z',
    });
    const call = fetchMock.mock.calls.find(([u]) => String(u).includes('/rest/v1/'));
    const headers = call?.[1]?.headers ?? {};
    expect(headers['Authorization']).toBe(`Bearer ${token}`);
    expect(headers['apikey']).toBe('anon-key');
  });

  it('GET 404 when the caller has no row yet', async () => {
    const { app, auth } = await setup(() => jsonResponse([]));
    expect((await app.request('/me/profile', { headers: auth })).status).toBe(404);
  });

  it('PUT 200 upserts and returns the profile', async () => {
    const { app, auth } = await setup();
    const res = await app.request('/me/profile', put(auth, { senderName: 'Ada' }));
    expect(res.status).toBe(200);
    expect(((await res.json()) as { senderName: string }).senderName).toBe('Ada');
  });

  it.each([{ unknown: 1 }, { senderName: 'x'.repeat(101) }, { contactSource: 'sms' }])(
    'PUT 400 for %j',
    async (body) => {
      const { app, auth } = await setup();
      expect((await app.request('/me/profile', put(auth, body))).status).toBe(400);
    },
  );

  it('503 when the JWKS cannot be fetched', async () => {
    const { app, auth } = await setup();
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('down')));
    expect((await app.request('/me/profile', { headers: auth })).status).toBe(503);
  });

  it('503 when SUPABASE_URL / SUPABASE_ANON_KEY are unset', async () => {
    const { auth } = await setup();
    const app = await loadApp({ SUPABASE_URL: '', SUPABASE_ANON_KEY: '' });
    const res = await app.request('/me/profile', { headers: auth });
    expect(res.status).toBe(503);
  });
});
