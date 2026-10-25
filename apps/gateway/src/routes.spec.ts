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
  'GET /members',
  'DELETE /members/:memberId',
  'POST /invites',
  'POST /invites/accept',
  'DELETE /invites/:id',
];

async function loadApp() {
  vi.resetModules();
  vi.unstubAllEnvs();
  vi.stubEnv('CORS_ORIGINS', 'https://web.grieversguidance.com');
  vi.stubEnv('ANTHROPIC_API_KEY', '');
  vi.stubEnv('SUPABASE_URL', 'https://proj.supabase.test');
  vi.stubEnv('SUPABASE_ANON_KEY', 'anon');
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
  ])('%s %s refuses a request with no token', async (method, path) => {
    const app = await loadApp();
    const res = await app.request(path, { method, body: method === 'PUT' || method === 'POST' ? '{}' : undefined });
    expect(res.status).toBe(401);
  });
});
