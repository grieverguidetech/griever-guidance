import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { randomUUID } from 'node:crypto';
import { templates } from '@griever/shared';
import type { SendEvent } from '@griever/shared';
import { sendSMS } from '@griever/sms';
import { getConvexClient } from './app/convexClient.js';
import { syncPull, syncPush, type PushOp } from './app/convexFunctions.js';

/**
 * The Cloudflare Workers entrypoint. Fastify (used for local dev via
 * ./app/app.ts and `pnpm dev:gateway`) does not run cleanly on Workers:
 * its plugin loader (avvio) relies on `setTimeout` in a way that breaks
 * under Workers' restrictions on timers outside an active request —
 * every request either 500s or hangs indefinitely, with no viable
 * workaround (disabling avvio's plugin timeout turns the fast error into
 * a silent hang, which is worse). Hono has no such assumptions and is
 * built for this runtime, so the deployed routes are reimplemented here
 * directly rather than reusing ./app/app.workers.ts's Fastify plugins —
 * that file (and the ./app/routes/*.ts Fastify route modules it wires up)
 * now serves local dev only, via app.ts's autoload.
 */

// Resets on every Worker restart/isolate recycle — same intentional,
// non-durable behavior as the local Fastify history route.
const sendEvents: SendEvent[] = [];

const corsOrigins = (process.env['CORS_ORIGINS'] ?? '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const app = new Hono();

app.use(
  '*',
  cors({
    // An empty array matches no origin — no Access-Control-Allow-Origin
    // header is ever sent. There is no "allow all" mode; CORS_ORIGINS must
    // be set explicitly (see wrangler.toml).
    origin: corsOrigins,
    allowMethods: ['GET', 'POST'],
  }),
);

app.get('/health', (c) => c.json({ ok: true }));

app.get('/templates', (c) =>
  c.json(
    templates.map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description,
      fields: t.fields,
    })),
  ),
);

app.get('/history/:userId', (c) => {
  const { userId } = c.req.param();
  return c.json(sendEvents.filter((e) => e.userId === userId));
});

app.post('/send', async (c) => {
  const body = await c.req.json().catch(() => null);
  if (
    !body ||
    typeof body.userId !== 'string' ||
    !body.userId ||
    typeof body.templateId !== 'string' ||
    !body.templateId ||
    !Array.isArray(body.contacts) ||
    body.contacts.length === 0 ||
    !body.contacts.every((contact: unknown) => typeof contact === 'string') ||
    typeof body.fields !== 'object' ||
    body.fields === null
  ) {
    return c.json({ error: 'Invalid request body' }, 400);
  }
  const { userId, templateId, contacts, fields } = body as {
    userId: string;
    templateId: string;
    contacts: string[];
    fields: Record<string, string>;
  };

  const template = templates.find((t) => t.id === templateId);
  if (!template) {
    return c.json({ error: `Unknown template: ${templateId}` }, 400);
  }

  const message = template.renderMessage(fields);
  await Promise.all(contacts.map((phone) => sendSMS(phone, message)));

  const event: SendEvent = {
    id: randomUUID(),
    userId,
    templateId,
    recipientCount: contacts.length,
    status: 'sent',
    createdAt: new Date().toISOString(),
    deceasedName: fields['deceasedName'] ?? '',
    serviceDate: fields['serviceDate'] ?? fields['eventDate'] ?? '',
    serviceLocation: fields['serviceLocation'] ?? fields['eventLocation'] ?? '',
    wakeTime: fields['wakeTime'],
  };
  sendEvents.unshift(event);
  return c.json(event);
});

function readDevUser(header: string | undefined): string | undefined {
  return header;
}

app.get('/sync/pull', async (c) => {
  const cursorRaw = c.req.query('cursor');
  if (cursorRaw === undefined) {
    return c.json({ error: "querystring must have required property 'cursor'" }, 400);
  }
  const client = getConvexClient();
  if (!client) return c.json({ error: 'Sync is not configured.' }, 500);

  const cursor = Number(cursorRaw);
  const limitRaw = c.req.query('limit');
  const limit = limitRaw ? Number(limitRaw) : undefined;
  const devUserId = readDevUser(c.req.header('x-gg-user'));

  try {
    return c.json(await client.query(syncPull, { cursor, limit, devUserId }));
  } catch (err) {
    console.error(err);
    return c.json({ error: 'Could not pull.' }, 400);
  }
});

app.post('/sync/push', async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body || typeof body.deviceId !== 'string' || !body.deviceId || !Array.isArray(body.ops)) {
    return c.json({ error: 'Invalid request body' }, 400);
  }
  const client = getConvexClient();
  if (!client) return c.json({ error: 'Sync is not configured.' }, 500);

  const { deviceId, ops } = body as { deviceId: string; ops: PushOp[] };
  const devUserId = readDevUser(c.req.header('x-gg-user'));

  try {
    return c.json(await client.mutation(syncPush, { deviceId, ops, devUserId }));
  } catch (err) {
    console.error(err);
    return c.json({ error: 'Could not push.' }, 400);
  }
});

export default app;
