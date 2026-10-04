/**
 * Integration tests for the composed gateway: the real Hono app from
 * worker.ts with identity, messages and sync mounted, exercised over HTTP via
 * `app.request`. No Convex, no network — routes are driven to their
 * validation and "not configured" branches, and Anthropic is a stubbed fetch.
 */
const WEB_ORIGIN = 'https://web.grieversguidance.com';

async function loadApp(env: Record<string, string | undefined> = {}) {
  vi.resetModules();
  vi.unstubAllEnvs();
  vi.stubEnv('CORS_ORIGINS', `${WEB_ORIGIN}, http://localhost:5173`);
  vi.stubEnv('CONVEX_URL', '');
  vi.stubEnv('CONVEX_SELF_HOSTED_URL', '');
  vi.stubEnv('ANTHROPIC_API_KEY', '');
  vi.stubEnv('IDENTITY_SESSION_SECRET', 'test-session-secret');
  vi.stubEnv('IDENTITY_SERVICE_SECRET', 'test-service-secret');
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value ?? '');
  return (await import('./worker.js')).default;
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

  it('answers preflight for allowed origins with GET and POST only', async () => {
    const app = await loadApp();
    const res = await app.request('/sync/push', {
      method: 'OPTIONS',
      headers: { Origin: WEB_ORIGIN, 'Access-Control-Request-Method': 'POST' },
    });
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-methods')).toBe('GET,POST');
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

  it('password sign-up rejects a missing name and a short password', async () => {
    const app = await loadApp();
    expect((await app.request('/auth/password/signup', json({ email: 'a@b.c', password: 'longenough1' }))).status).toBe(400);
    const short = await app.request('/auth/password/signup', json({ email: 'a@b.c', password: 'x', senderName: 'P' }));
    expect(short.status).toBe(400);
  });

  it('session requires a bearer token', async () => {
    const app = await loadApp();
    expect((await app.request('/auth/session')).status).toBe(401);
    const bad = await app.request('/auth/session', { headers: { Authorization: 'Bearer not-a-token' } });
    expect(bad.status).toBe(401);
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

  it('sign-in without its secrets', async () => {
    const app = await loadApp({ IDENTITY_SESSION_SECRET: '' });
    expect((await app.request('/auth/session')).status).toBe(500);
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
