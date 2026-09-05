import { serve } from '@hono/node-server';
import app from './worker.js';

const host = process.env['HOST'] ?? 'localhost';
const port = process.env['PORT'] ? Number(process.env['PORT']) : 3001;

serve({ fetch: app.fetch, hostname: host, port }, (info) => {
  console.log(`Gateway listening at http://${host}:${info.port}`);
});
