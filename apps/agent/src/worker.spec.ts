import worker from './worker.js';

const call = (path: string, init: RequestInit = {}, env: unknown = {}) =>
  worker.fetch(new Request(`https://agent.test${path}`, init), env);

const post = (headers: Record<string, string> = {}) => ({ method: 'POST', headers, body: '{}' });

describe('agent worker', () => {
  it('answers GET /health with 200', async () => {
    const res = await call('/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('answers GET /mcp with 405', async () => {
    const res = await call('/mcp');
    expect(res.status).toBe(405);
    expect(res.headers.get('allow')).toBe('POST');
  });

  it('answers an unknown path with 404', async () => {
    expect((await call('/nope')).status).toBe(404);
    expect((await call('/health', { method: 'POST' })).status).toBe(404);
  });

  it('answers POST /mcp with a calm 501 for now', async () => {
    const res = await call('/mcp', post());
    expect(res.status).toBe(501);
    expect(await res.text()).not.toContain('!');
  });

  describe('rate limit', () => {
    it('answers 429 with Retry-After 60 over the limit, keyed on CF-Connecting-IP', async () => {
      const limit = vi.fn().mockResolvedValue({ success: false });
      const res = await call('/mcp', post({ 'CF-Connecting-IP': '203.0.113.7' }), {
        AGENT_RATE_LIMITER: { limit },
      });
      expect(res.status).toBe(429);
      expect(res.headers.get('retry-after')).toBe('60');
      expect(limit).toHaveBeenCalledWith({ key: 'ip:203.0.113.7' });
    });

    it('lets the request through under the limit', async () => {
      const limit = vi.fn().mockResolvedValue({ success: true });
      const res = await call('/mcp', post({ 'CF-Connecting-IP': '203.0.113.7' }), {
        AGENT_RATE_LIMITER: { limit },
      });
      expect(res.status).toBe(501);
    });

    it('fails open when the limiter throws', async () => {
      const limit = vi.fn().mockRejectedValue(new Error('down'));
      const res = await call('/mcp', post({ 'CF-Connecting-IP': '203.0.113.7' }), {
        AGENT_RATE_LIMITER: { limit },
      });
      expect(res.status).toBe(501);
    });

    it('has no limit when the binding is missing', async () => {
      const res = await call('/mcp', post({ 'CF-Connecting-IP': '203.0.113.7' }), {});
      expect(res.status).toBe(501);
    });

    it('does not rate limit GET /mcp or /health', async () => {
      const limit = vi.fn().mockResolvedValue({ success: false });
      const env = { AGENT_RATE_LIMITER: { limit } };
      const headers = { 'CF-Connecting-IP': '203.0.113.7' };
      expect((await call('/health', { headers }, env)).status).toBe(200);
      expect((await call('/mcp', { headers }, env)).status).toBe(405);
      expect(limit).not.toHaveBeenCalled();
    });
  });

  it('logs nothing', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) =>
      vi.spyOn(console, m).mockImplementation(() => undefined),
    );
    const limit = vi.fn().mockRejectedValue(new Error('down'));
    await call('/mcp', post({ 'CF-Connecting-IP': '203.0.113.7' }), { AGENT_RATE_LIMITER: { limit } });
    await call('/nope');
    for (const spy of spies) {
      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    }
  });
});
