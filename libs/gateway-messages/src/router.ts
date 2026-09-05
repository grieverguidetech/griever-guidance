import { Hono } from 'hono';
import { templatesRoute } from './templatesRoute.js';
import { historyRoute } from './historyRoute.js';
import { sendRoute } from './sendRoute.js';
import { obituaryRoute } from './obituaryRoute.js';

export const messagesRouter = new Hono()
  .route('/', templatesRoute)
  .route('/', historyRoute)
  .route('/', sendRoute)
  .route('/', obituaryRoute);
