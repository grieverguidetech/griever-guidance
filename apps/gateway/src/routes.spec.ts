/**
 * C8: every gateway route validates its request. This lists every route the composed app
 * actually serves, so adding a route without deciding how it is validated fails here, and
 * drives each public-input route with an empty request to prove it is refused, not accepted.
 */
const EXPECTED_ROUTES = [
  'GET /health',
  'GET /me/profile',
  'PUT /me/profile',
  'POST /obituary',
  'POST /webhooks/clerk',
  'GET /members',
  'DELETE /members/:memberId',
  'POST /invites',
  'POST /invites/accept',
  'DELETE /invites/:id',
  'GET /flows',
  'POST /flows',
  'PATCH /flows/:id',
  'POST /places/suggest',
  'POST /places/details',
];

async function loadApp() {
  vi.resetModules();
  vi.unstubAllEnvs();
  vi.stubEnv('CORS_ORIGINS', 'https://web.grieversguidance.com');
  vi.stubEnv('ANTHROPIC_API_KEY', '');
  vi.stubEnv('CLERK_ISSUER', 'https://clerk.example.test');
  const mod = await import('./worker.js');
  return mod.default as unknown as typeof mod.default.default;
}

afterEach(() => vi.unstubAllEnvs());

describe('gateway route inventory (C8)', () => {
  it('serves exactly the routes whose validation is accounted for below', async () => {
    const app = await loadApp();
    const served = app.routes
      .filter((r) => r.method !== 'ALL')
      .map((r) => `${r.method} ${r.path}`)
      .sort();
    expect(served).toEqual([...EXPECTED_ROUTES].sort());
  });

  it.each([
    ['POST', '/obituary'],
    ['POST', '/places/suggest'],
    ['POST', '/places/details'],
  ])('%s %s refuses an empty request with 400', async (method, path) => {
    const app = await loadApp();
    const res = await app.request(path, { method });
    expect(res.status).toBe(400);
  });

  it.each([
    ['GET', '/me/profile'],
    ['PUT', '/me/profile'],
    ['GET', '/members'],
    ['POST', '/invites'],
    ['POST', '/invites/accept'],
    ['DELETE', '/invites/00000000-0000-4000-8000-000000000000'],
    ['DELETE', '/members/00000000-0000-4000-8000-000000000000'],
    ['GET', '/flows'],
    ['POST', '/flows'],
    ['PATCH', '/flows/00000000-0000-4000-8000-000000000000'],
  ])('%s %s refuses a request with no token', async (method, path) => {
    const app = await loadApp();
    const res = await app.request(path, { method, body: method === 'PUT' || method === 'POST' || method === 'PATCH' ? '{}' : undefined });
    expect(res.status).toBe(401);
  });

  it('POST /webhooks/clerk refuses an unsigned request with 401', async () => {
    const app = await loadApp();
    vi.stubEnv('CLERK_WEBHOOK_SECRET', 'whsec_dGVzdA==');
    const res = await app.request('/webhooks/clerk', { method: 'POST', body: '{"type":"user.deleted"}' });
    expect(res.status).toBe(401);
  });

  describe('place search (public, no sign-in)', () => {
    const body = JSON.stringify({ input: 'Smith Funeral', sessionToken: 'abcdefghijklmnop1234' });
    const post = (app: Awaited<ReturnType<typeof loadApp>>, headers: Record<string, string> = {}) =>
      app.request('/places/suggest', { method: 'POST', body, headers: { 'content-type': 'application/json', ...headers } });

    afterEach(() => vi.unstubAllGlobals());

    it('answers 503 with no key and never calls Google', async () => {
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);
      const app = await loadApp();
      vi.stubEnv('GOOGLE_PLACES_SERVER_KEY', '');
      expect((await post(app)).status).toBe(503);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('answers 200 in the shared shape with a key and a stubbed Google', async () => {
      const fetchMock = vi.fn(async () =>
        new Response(JSON.stringify({ suggestions: [{ placePrediction: { placeId: 'p1', text: { text: 'A Chapel, OK, USA' } } }] })),
      );
      vi.stubGlobal('fetch', fetchMock);
      const app = await loadApp();
      vi.stubEnv('GOOGLE_PLACES_SERVER_KEY', 'test-key-not-real');
      const res = await post(app);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({
        suggestions: [{ id: 'p1', text: 'A Chapel, OK', mainText: 'A Chapel, OK', secondaryText: '' }],
      });
    });

    it('echoes CORS only for a configured origin', async () => {
      const app = await loadApp();
      const allowed = await post(app, { origin: 'https://web.grieversguidance.com' });
      expect(allowed.headers.get('access-control-allow-origin')).toBe('https://web.grieversguidance.com');
      const other = await post(app, { origin: 'https://evil.example' });
      expect(other.headers.get('access-control-allow-origin')).toBeNull();
    });
  });
});
