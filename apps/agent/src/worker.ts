import { checkRateLimit } from './rateLimit.js';

const jsonResponse = (body: unknown, status: number, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });

/** Placeholder until the MCP handler is wired in (#1017). */
const notImplemented = () =>
  jsonResponse({ error: 'The assistant connection is not available yet.' }, 501);

async function handleMcp(request: Request, env: unknown): Promise<Response> {
  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed.' }, 405, { Allow: 'POST' });
  }
  const limited = await checkRateLimit(request, env);
  if (limited) {
    return limited;
  }
  return notImplemented();
}

export default {
  async fetch(request: Request, env: unknown): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (pathname === '/health' && request.method === 'GET') {
      return jsonResponse({ ok: true }, 200);
    }
    if (pathname === '/mcp') {
      return handleMcp(request, env);
    }
    return jsonResponse({ error: 'Not found.' }, 404);
  },
};
