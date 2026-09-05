import { FastifyInstance } from 'fastify';
import { getConvexClient } from '../convexClient.js';
import { syncPull, syncPush, type PushOp } from '../convexFunctions.js';

/**
 * The gateway's REST proxy onto Convex's cursor sync protocol (DATA.md §4).
 * `apps/web` calls these, never Convex directly (CLAUDE.md rule 2a).
 *
 * `x-gg-user` is this deployment's stand-in for real auth — the header
 * DATA.md's dev stub originally described. It can live here for real,
 * because unlike a Convex `query`/`mutation` (which never sees raw request
 * headers — see `convex/auth.ts`), the gateway is a plain HTTP server that
 * does. The gateway reads it and forwards it as `devUserId` to Convex.
 */
function readDevUser(header: string | string[] | undefined): string | undefined {
  return Array.isArray(header) ? header[0] : header;
}

const pullQuerySchema = {
  type: 'object',
  required: ['cursor'],
  properties: {
    cursor: { type: 'string' },
    limit: { type: 'string' },
  },
} as const;

const pushBodySchema = {
  type: 'object',
  required: ['deviceId', 'ops'],
  properties: {
    deviceId: { type: 'string', minLength: 1 },
    ops: { type: 'array' },
  },
} as const;

export default async function (fastify: FastifyInstance) {
  fastify.get<{ Querystring: { cursor: string; limit?: string } }>(
    '/sync/pull',
    { schema: { querystring: pullQuerySchema } },
    async (request, reply) => {
      const client = getConvexClient();
      if (!client) return reply.status(500).send({ error: 'Sync is not configured.' });

      const devUserId = readDevUser(request.headers['x-gg-user']);
      const cursor = Number(request.query.cursor);
      const limit = request.query.limit ? Number(request.query.limit) : undefined;

      try {
        return await client.query(syncPull, { cursor, limit, devUserId });
      } catch (err) {
        request.log.error(err);
        return reply.status(400).send({ error: 'Could not pull.' });
      }
    }
  );

  fastify.post<{ Body: { deviceId: string; ops: PushOp[] } }>(
    '/sync/push',
    { schema: { body: pushBodySchema } },
    async (request, reply) => {
      const client = getConvexClient();
      if (!client) return reply.status(500).send({ error: 'Sync is not configured.' });

      const devUserId = readDevUser(request.headers['x-gg-user']);
      const { deviceId, ops } = request.body;

      try {
        return await client.mutation(syncPush, { deviceId, ops, devUserId });
      } catch (err) {
        request.log.error(err);
        return reply.status(400).send({ error: 'Could not push.' });
      }
    }
  );
}
