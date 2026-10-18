import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { profileRouter } from '@griever/identity';
import { messagesRouter } from '@griever/gateway-messages';
import { syncRouter } from '@griever/gateway-sync';
import { membersRouter } from '@griever/gateway-flows';

/**
 * The gateway composes four independent domain libs — identity, messages,
 * sync, and flows each own their routes and business logic, with no cross-imports
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
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE'],
  }),
);

app.get('/health', (c) => c.json({ ok: true }));
app.route('/', profileRouter);
app.route('/', messagesRouter);
app.route('/', syncRouter);
app.route('/', membersRouter);

export default app;
