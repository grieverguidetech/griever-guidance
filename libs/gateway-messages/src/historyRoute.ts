import { Hono } from 'hono';
import { listEventsForUser } from './sendEvents.js';

export const historyRoute = new Hono().get('/history/:userId', (c) =>
  c.json(listEventsForUser(c.req.param('userId'))),
);
