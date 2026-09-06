import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { identityRouter } from '@griever/identity';
import { messagesRouter } from '@griever/gateway-messages';
import { syncRouter } from '@griever/gateway-sync';

/**
 * The gateway composes three independent domain libs — identity, messages,
 * and sync each own their routes and business logic, with no cross-imports
 * between them. This file's only job is wiring them into one HTTP surface
 * (CORS + routing) — it should never grow domain logic of its own.
 *
 * One Hono app, used both here (Cloudflare Workers, via `export default`)
 * and by ./main.ts (local dev, via @hono/node-server) — a single
 * implementation, not two that drift.
 */

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
    // be set explicitly (see apps/gateway/wrangler.toml and .env.local).
    origin: corsOrigins,
    allowMethods: ['GET', 'POST'],
  }),
);

app.get('/health', (c) => c.json({ ok: true }));
app.route('/', identityRouter);
app.route('/', messagesRouter);
app.route('/', syncRouter);

export default app;
