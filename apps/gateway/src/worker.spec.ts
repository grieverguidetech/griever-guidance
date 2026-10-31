/**
 * Integration tests for the composed gateway: the real Hono app from
 * worker.ts with identity, messages and flows mounted, exercised over HTTP via
 * `app.request`. No network — routes are driven to their
 * validation and "not configured" branches, and Anthropic is a stubbed fetch.
 */
const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const WEB_ORIGIN = 'https://web.grieversguidance.com';

async function loadApp(env: Record<string, string | undefined> = {}) {
  vi.resetModules();
  vi.unstubAllEnvs();
  vi.stubEnv('CORS_ORIGINS', `${WEB_ORIGIN}, http://localhost:5173`);
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

  it('answers preflight for allowed origins with GET, POST, PUT, PATCH and DELETE only', async () => {
    const app = await loadApp();
    const res = await app.request('/obituary', {
      method: 'OPTIONS',
      headers: { Origin: WEB_ORIGIN, 'Access-Control-Request-Method': 'POST' },
    });
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-methods')).toBe('GET,POST,PUT,PATCH,DELETE');
  });

  it('allows a PATCH preflight from the web origin and not from another origin', async () => {
    const app = await loadApp();
    const preflight = (origin: string) =>
      app.request('/flows/00000000-0000-4000-8000-000000000000', {
        method: 'OPTIONS',
        headers: { Origin: origin, 'Access-Control-Request-Method': 'PATCH' },
      });
    const allowed = await preflight(WEB_ORIGIN);
    expect(allowed.headers.get('access-control-allow-origin')).toBe(WEB_ORIGIN);
    expect(allowed.headers.get('access-control-allow-methods')).toContain('PATCH');
    const other = await preflight('https://evil.example');
    expect(other.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('allows a DELETE preflight from the web origin and not from another origin', async () => {
    const app = await loadApp();
    const preflight = (origin: string) =>
      app.request('/invites/00000000-0000-4000-8000-000000000000', {
        method: 'OPTIONS',
        headers: { Origin: origin, 'Access-Control-Request-Method': 'DELETE' },
      });
    const allowed = await preflight(WEB_ORIGIN);
    expect(allowed.headers.get('access-control-allow-origin')).toBe(WEB_ORIGIN);
    expect(allowed.headers.get('access-control-allow-methods')).toContain('DELETE');
    const other = await preflight('https://evil.example');
    expect(other.headers.get('access-control-allow-origin')).toBeNull();
  });
});

describe('gateway: every route validates its input (REQUIREMENTS C8)', () => {
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

describe('removed sync routes', () => {
  it('answer 404 (Convex was removed, #203)', async () => {
    const app = await loadApp();
    expect((await app.request('/sync/pull?cursor=0')).status).toBe(404);
    expect((await app.request('/sync/push', json({ deviceId: 'd1', ops: [] }))).status).toBe(404);
  });
});

describe('gateway: unconfigured services fail closed with a plain message', () => {
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

describe('gateway: /me/profile (Clerk accounts, data function)', () => {
  const CLERK_ISSUER = 'https://clerk.example.test';
  const DATA_URL = 'http://127.0.0.1:3002';
  const ENV = {
    CLERK_ISSUER,
    CLERK_AUTHORIZED_PARTIES: WEB_ORIGIN,
    DATA_FUNCTION_URL: DATA_URL,
  };
  const STORED = {
    userId: 'user_abc123',
    senderName: 'Ada',
    accountType: 'owner',
    version: 1,
    createdAt: '2026-10-11T10:00:00.000Z',
    updatedAt: '2026-10-11T10:00:00.000Z',
  };

  async function makeRsaKey() {
    const pair = await crypto.subtle.generateKey(
      { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
      true,
      ['sign', 'verify'],
    );
    return {
      privateJwk: { ...(await crypto.subtle.exportKey('jwk', pair.privateKey)), kid: 'k1', alg: 'RS256' },
      publicJwk: { ...(await crypto.subtle.exportKey('jwk', pair.publicKey)), kid: 'k1', alg: 'RS256' },
    };
  }

  // Stubs the JWKS and the data function; anything else is a test bug.
  async function setup(data: () => Response = () => jsonResponse({ ok: true, data: STORED })) {
    const key = await makeRsaKey();
    const { Jwt } = await import('hono/utils/jwt');
    const token = await Jwt.sign(
      {
        sub: 'user_abc123',
        iss: CLERK_ISSUER,
        azp: WEB_ORIGIN,
        exp: Math.floor(Date.now() / 1000) + 300,
        email: 'ada@example.test',
      },
      key.privateJwk,
      'RS256',
    );
    const fetchMock = vi.fn(async (url: string, _init?: { headers: Record<string, string>; body?: string }) => {
      if (url === `${CLERK_ISSUER}/.well-known/jwks.json`) return jsonResponse({ keys: [key.publicJwk] });
      if (url === `${DATA_URL}/v1`) return data();
      throw new Error(`unexpected fetch ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
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
      id: 'user_abc123',
      senderName: 'Ada',
      contactSource: null,
      accountType: 'owner',
      createdAt: '2026-10-11T10:00:00.000Z',
      updatedAt: '2026-10-11T10:00:00.000Z',
    });
    const call = fetchMock.mock.calls.find(([u]) => String(u).endsWith('/v1'));
    expect(call?.[1]?.headers['x-gg-user-token']).toBe(token);
    expect(JSON.parse(call?.[1]?.body ?? '{}')).toEqual({ action: 'getProfile', args: {} });
  });

  it('GET 404 when the caller has no profile yet', async () => {
    const { app, auth } = await setup(() => jsonResponse({ ok: true, data: null }));
    expect((await app.request('/me/profile', { headers: auth })).status).toBe(404);
  });

  it('PUT 200 writes and returns the profile', async () => {
    const { app, auth, fetchMock } = await setup();
    const res = await app.request('/me/profile', put(auth, { senderName: 'Ada' }));
    expect(res.status).toBe(200);
    expect(((await res.json()) as { senderName: string }).senderName).toBe('Ada');
    const call = fetchMock.mock.calls.find(([u]) => String(u).endsWith('/v1'));
    expect(JSON.parse(call?.[1]?.body ?? '{}')).toEqual({ action: 'putProfile', args: { fields: { senderName: 'Ada' } } });
  });

  it.each([{ unknown: 1 }, { senderName: 'x'.repeat(101) }, { contactSource: 'sms' }])(
    'PUT 400 for %j',
    async (body) => {
      const { app, auth } = await setup();
      expect((await app.request('/me/profile', put(auth, body))).status).toBe(400);
    },
  );

  it('503 with calm copy when the data function is busy', async () => {
    const { app, auth } = await setup(() => jsonResponse({ ok: false, code: 'busy', message: 'try later' }));
    const res = await app.request('/me/profile', { headers: auth });
    expect(res.status).toBe(503);
  });

  it('401 when the data function refuses the user token', async () => {
    const { app, auth } = await setup(() => new Response('', { status: 401 }));
    expect((await app.request('/me/profile', { headers: auth })).status).toBe(401);
  });

  it('503 when the JWKS cannot be fetched', async () => {
    const { app, auth } = await setup();
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('down')));
    expect((await app.request('/me/profile', { headers: auth })).status).toBe(503);
  });

  it('503 when CLERK_ISSUER is unset', async () => {
    const { auth } = await setup();
    const app = await loadApp({ ...ENV, CLERK_ISSUER: '' });
    expect((await app.request('/me/profile', { headers: auth })).status).toBe(503);
  });

  it('503 and no request when the data function URL is remote and the region is unset', async () => {
    const { auth, fetchMock } = await setup();
    const app = await loadApp({
      ...ENV,
      DATA_FUNCTION_URL: 'https://abc.lambda-url.us-east-2.on.aws',
      DATA_FUNCTION_ACCESS_KEY_ID: 'AKIAEXAMPLE',
      DATA_FUNCTION_SECRET_ACCESS_KEY: 'secret',
      DATA_FUNCTION_REGION: '',
    });
    fetchMock.mockClear();
    const res = await app.request('/me/profile', { headers: auth });
    expect(res.status).toBe(503);
    expect(fetchMock.mock.calls.some(([u]) => String(u).includes('lambda-url'))).toBe(false);
  });

  it('answers a PUT preflight for the web origin', async () => {
    const { app } = await setup();
    const res = await app.request('/me/profile', {
      method: 'OPTIONS',
      headers: { Origin: WEB_ORIGIN, 'Access-Control-Request-Method': 'PUT', 'Access-Control-Request-Headers': 'authorization,content-type' },
    });
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBe(WEB_ORIGIN);
    expect(res.headers.get('access-control-allow-methods')).toContain('PUT');
  });

  it('503 when DATA_FUNCTION_URL is unset', async () => {
    const { auth } = await setup();
    const app = await loadApp({ ...ENV, DATA_FUNCTION_URL: '' });
    expect((await app.request('/me/profile', { headers: auth })).status).toBe(503);
  });
});

describe('gateway: POST /invites reads the mail settings by their env names', () => {
  const CLERK_ISSUER = 'https://clerk.example.test';
  const DATA_URL = 'http://127.0.0.1:3002';
  const INVITE_ID = '22222222-2222-4222-8222-222222222222';
  const MAIL_ENV = {
    CLERK_ISSUER,
    DATA_FUNCTION_URL: DATA_URL,
    INVITE_FROM_EMAIL: 'X <x@example.test>',
    WEB_URL: 'https://web.example.test',
  };
  const invite = {
    id: INVITE_ID,
    email: 'friend@example.test',
    expiresAt: '2026-10-19T10:00:00.000Z',
    createdAt: '2026-10-12T10:00:00.000Z',
  };

  async function setup(env: Record<string, string | undefined>) {
    const pair = await crypto.subtle.generateKey(
      { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
      true,
      ['sign', 'verify'],
    );
    const privateJwk = { ...(await crypto.subtle.exportKey('jwk', pair.privateKey)), kid: 'k1', alg: 'RS256' };
    const publicJwk = { ...(await crypto.subtle.exportKey('jwk', pair.publicKey)), kid: 'k1', alg: 'RS256' };
    const { Jwt } = await import('hono/utils/jwt');
    const token = await Jwt.sign(
      { sub: 'user_abc123', iss: CLERK_ISSUER, exp: Math.floor(Date.now() / 1000) + 300, email: 'ada@example.test' },
      privateJwk,
      'RS256',
    );
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === `${CLERK_ISSUER}/.well-known/jwks.json`) return jsonResponse({ keys: [publicJwk] });
      if (url === `${DATA_URL}/v1`) {
        const { action } = JSON.parse(String(init?.body));
        if (action === 'createInvite') return jsonResponse({ ok: true, data: invite });
        if (action === 'getProfile') return jsonResponse({ ok: true, data: { userId: 'user_abc123', senderName: 'Ada' } });
      }
      if (url === 'https://api.resend.com/emails') return jsonResponse({ id: 'email-1' });
      throw new Error(`unexpected fetch ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    const app = await loadApp(env);
    const req = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ email: 'friend@example.test' }),
    };
    return { app, req, fetchMock };
  }

  const dataActions = (fetchMock: { mock: { calls: unknown[][] } }) =>
    fetchMock.mock.calls
      .filter(([url]) => url === `${DATA_URL}/v1`)
      .map(([, init]) => JSON.parse(String((init as RequestInit).body)).action);

  it('sends the email with the configured key, sender and web origin', async () => {
    const { app, req, fetchMock } = await setup({ ...MAIL_ENV, RESEND_API_KEY: 're_test' });
    const res = await app.request('/invites', req);
    expect(res.status).toBe(201);
    expect(dataActions(fetchMock)).toContain('createInvite');

    const call = fetchMock.mock.calls.find(([url]) => url === 'https://api.resend.com/emails');
    expect(call).toBeDefined();
    const init = call![1] as RequestInit;
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer re_test');
    const sent = JSON.parse(init.body as string);
    expect(sent.from).toBe('X <x@example.test>');
    expect(sent.text).toContain('https://web.example.test/join#t=');
  });

  it('answers 503 and creates no invite when RESEND_API_KEY is unset', async () => {
    const { app, req, fetchMock } = await setup(MAIL_ENV);
    const res = await app.request('/invites', req);
    expect(res.status).toBe(503);
    expect(dataActions(fetchMock)).not.toContain('createInvite');
    expect(fetchMock.mock.calls.map(([url]) => url)).not.toContain('https://api.resend.com/emails');
  });
});
