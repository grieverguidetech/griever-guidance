import { Hono } from 'hono';
import { obituaryRoute } from './obituaryRoute.js';

/**
 * Sending itself moved entirely to the client (see @griever/hooks' sms:
 * deep-link stepper) — the griever texts each contact from their own
 * number, one at a time, with no backend call at all. This lib now only
 * holds the one thing that still needs a server: the AI-drafted obituary.
 */
export const messagesRouter = new Hono().route('/', obituaryRoute);
