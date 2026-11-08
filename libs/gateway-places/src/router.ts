import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import type { PlaceSuggestResponse } from '@griever/shared';
import { googleDetails, googleSuggest } from './google.js';
import { placesRateLimit } from './rateLimit.js';
import { parseDetailsBody, parseSuggestBody } from './validate.js';

export const NOT_SET_UP = 'Place search is not set up.';
export const INVALID_BODY = 'Invalid request body';
export const UNAVAILABLE = 'Place suggestions are not available right now.';

/**
 * Public place search (no sign-in; the field must work before accounts are on). It stores, caches
 * and logs nothing: no typed text, no place id, no Google body, no key. Only the typed text, the
 * allowed place types and the session token reach Google.
 */
export const placesRouter = new Hono();

placesRouter.use('/places/*', async (c, next) => {
  await next();
  c.header('Cache-Control', 'no-store');
});
placesRouter.use('/places/*', placesRateLimit());

// Both bodies are tiny (a typed line, a token, up to 5 types); 2 KB is generous.
const limitBody = bodyLimit({ maxSize: 2048, onError: (c) => c.json({ error: INVALID_BODY }, 413) });
placesRouter.use('/places/*', limitBody);

/**
 * Read on each request from process.env, trimmed, the same way libs/identity reads its Worker
 * secrets (for example CLERK_WEBHOOK_SECRET in identity/src/index.ts), so a key set after startup is seen.
 */
export const readServerKey = () => process.env['GOOGLE_PLACES_SERVER_KEY']?.trim() || undefined;

placesRouter.post('/places/suggest', async (c) => {
  const body = parseSuggestBody(await c.req.json().catch(() => null));
  if (!body) {
    return c.json({ error: INVALID_BODY }, 400);
  }
  const key = readServerKey();
  if (!key) {
    return c.json({ error: NOT_SET_UP }, 503);
  }
  try {
    const suggestions = await googleSuggest(body.input, body.types ?? [], body.sessionToken, key);
    return c.json({ suggestions } satisfies PlaceSuggestResponse);
  } catch {
    return c.json({ error: UNAVAILABLE }, 502);
  }
});

placesRouter.post('/places/details', async (c) => {
  const body = parseDetailsBody(await c.req.json().catch(() => null));
  if (!body) {
    return c.json({ error: INVALID_BODY }, 400);
  }
  const key = readServerKey();
  if (!key) {
    return c.json({ error: NOT_SET_UP }, 503);
  }
  try {
    return c.json(await googleDetails(body.placeId, body.sessionToken, key));
  } catch {
    return c.json({ error: UNAVAILABLE }, 502);
  }
});
