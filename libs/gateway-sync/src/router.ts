import { Hono } from 'hono';
import { getConvexClient } from './convexClient.js';
import { syncPull, syncPush, type PushOp } from './convexFunctions.js';

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
export const syncRouter = new Hono()
  .get('/sync/pull', async (c) => {
    const cursorRaw = c.req.query('cursor');
    if (cursorRaw === undefined) {
      return c.json({ error: "querystring must have required property 'cursor'" }, 400);
    }
    const client = getConvexClient();
    if (!client) return c.json({ error: 'Sync is not configured.' }, 500);

    const cursor = Number(cursorRaw);
    const limitRaw = c.req.query('limit');
    const limit = limitRaw ? Number(limitRaw) : undefined;
    const devUserId = c.req.header('x-gg-user');

    try {
      return c.json(await client.query(syncPull, { cursor, limit, devUserId }));
    } catch (err) {
      console.error(err);
      return c.json({ error: 'Could not pull.' }, 400);
    }
  })
  .post('/sync/push', async (c) => {
    const body = await c.req.json().catch(() => null);
    if (!body || typeof body.deviceId !== 'string' || !body.deviceId || !Array.isArray(body.ops)) {
      return c.json({ error: 'Invalid request body' }, 400);
    }
    const client = getConvexClient();
    if (!client) return c.json({ error: 'Sync is not configured.' }, 500);

    const { deviceId, ops } = body as { deviceId: string; ops: PushOp[] };
    const devUserId = c.req.header('x-gg-user');

    try {
      return c.json(await client.mutation(syncPush, { deviceId, ops, devUserId }));
    } catch (err) {
      console.error(err);
      return c.json({ error: 'Could not push.' }, 400);
    }
  });
