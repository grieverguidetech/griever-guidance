import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { appWorkers } from './app/app.workers';

type InjectResponse = { rawPayload: Buffer; statusCode: number; headers: Record<string, string | string[]> };

let serverPromise: Promise<FastifyInstance> | undefined;

function getServer(): Promise<FastifyInstance> {
  if (!serverPromise) {
    const server = Fastify({ logger: false });
    serverPromise = server
      .register(appWorkers)
      .then(() => server.ready())
      .then(() => server) as Promise<FastifyInstance>;
  }
  return serverPromise;
}

export default {
  async fetch(request: Request): Promise<Response> {
    const server = await getServer();
    const url = new URL(request.url);
    const isBodyless = request.method === 'GET' || request.method === 'HEAD';

    const res = (await server.inject({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      method: request.method as any,
      url: url.pathname + url.search,
      headers: Object.fromEntries(request.headers.entries()),
      payload: isBodyless ? undefined : await request.text(),
    })) as unknown as InjectResponse;

    return new Response(res.rawPayload, {
      status: res.statusCode,
      headers: res.headers as Record<string, string>,
    });
  },
};
