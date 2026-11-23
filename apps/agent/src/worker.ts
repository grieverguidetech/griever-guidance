import { createMcpHandler } from '@modelcontextprotocol/server';
import { checkRateLimit } from './rateLimit.js';
import { createAgentServer } from './server.js';

const jsonResponse = (
  body: unknown,
  status: number,
  headers: Record<string, string> = {},
) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });

/** Stateless: no session id, a body cap of 16 KiB, and nothing reported out of band. */
const mcpHandler = createMcpHandler(() => createAgentServer(), {
  legacy: 'stateless',
  responseMode: 'json',
  maxRequestBodySize: 16384,
  onerror: () => undefined,
});

async function handleMcp(request: Request, env: unknown): Promise<Response> {
  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed.' }, 405, {
      Allow: 'POST',
    });
  }
  const limited = await checkRateLimit(request, env);
  if (limited) {
    return limited;
  }
  return mcpHandler.fetch(request);
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
