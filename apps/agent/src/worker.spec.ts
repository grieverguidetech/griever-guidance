import worker from './worker.js';

const call = (path: string, init: RequestInit = {}, env: unknown = {}) =>
  worker.fetch(new Request(`https://agent.test${path}`, init), env);

const mcpHeaders = {
  'Content-Type': 'application/json',
  Accept: 'application/json, text/event-stream',
  'MCP-Protocol-Version': '2025-06-18',
};
const listTools = JSON.stringify({
  jsonrpc: '2.0',
  id: 1,
  method: 'tools/list',
  params: {},
});

const post = (
  headers: Record<string, string> = {},
  body: string = listTools,
) => ({
  method: 'POST',
  headers: { ...mcpHeaders, ...headers },
  body,
});

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

  it('answers POST /mcp through the MCP handler, with no session id', async () => {
    const res = await call('/mcp', post());
    expect(res.status).toBe(200);
    expect(res.headers.get('mcp-session-id')).toBeNull();
    const text = await res.text();
    const body = JSON.parse(
      text
        .split('\n')
        .find((l: string) => l.startsWith('data:'))
        ?.slice(5) ?? text,
    );
    expect(body.result.tools).toHaveLength(2);
  });

  it('answers 413 for a body over 16 KiB', async () => {
    const big = JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list',
      params: { pad: 'x'.repeat(17000) },
    });
    const res = await call('/mcp', post({}, big));
    expect(res.status).toBe(413);
  });

  describe('rate limit', () => {
    it('answers 429 with Retry-After 60 over the limit, keyed on CF-Connecting-IP', async () => {
      const limit = vi.fn().mockResolvedValue({ success: false });
      const res = await call(
        '/mcp',
        post({ 'CF-Connecting-IP': '203.0.113.7' }),
        {
          AGENT_RATE_LIMITER: { limit },
        },
      );
      expect(res.status).toBe(429);
      expect(res.headers.get('retry-after')).toBe('60');
      expect(limit).toHaveBeenCalledWith({ key: 'ip:203.0.113.7' });
    });

    it('lets the request through under the limit', async () => {
      const limit = vi.fn().mockResolvedValue({ success: true });
      const res = await call(
        '/mcp',
        post({ 'CF-Connecting-IP': '203.0.113.7' }),
        {
          AGENT_RATE_LIMITER: { limit },
        },
      );
      expect(res.status).toBe(200);
    });

    it('fails open when the limiter throws', async () => {
      const limit = vi.fn().mockRejectedValue(new Error('down'));
      const res = await call(
        '/mcp',
        post({ 'CF-Connecting-IP': '203.0.113.7' }),
        {
          AGENT_RATE_LIMITER: { limit },
        },
      );
      expect(res.status).toBe(200);
    });

    it('has no limit when the binding is missing', async () => {
      const res = await call(
        '/mcp',
        post({ 'CF-Connecting-IP': '203.0.113.7' }),
        {},
      );
      expect(res.status).toBe(200);
    });

    it('does not call the limiter without a CF-Connecting-IP header', async () => {
      const limit = vi.fn().mockResolvedValue({ success: false });
      const res = await call('/mcp', post(), { AGENT_RATE_LIMITER: { limit } });
      expect(res.status).toBe(200);
      expect(limit).not.toHaveBeenCalled();
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
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map(
      (m) => vi.spyOn(console, m).mockImplementation(() => undefined),
    );
    const down = vi.fn().mockRejectedValue(new Error('down'));
    const over = vi.fn().mockResolvedValue({ success: false });
    const headers = { 'CF-Connecting-IP': '203.0.113.7' };
    await call('/mcp', post(headers), { AGENT_RATE_LIMITER: { limit: down } });
    await call('/mcp', post(headers), { AGENT_RATE_LIMITER: { limit: over } });
    await call('/mcp');
    await call('/nope');
    for (const spy of spies) {
      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    }
  });
});
