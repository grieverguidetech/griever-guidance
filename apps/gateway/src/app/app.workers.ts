import { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import sensiblePlugin from './plugins/sensible';
import rootRoutes from './routes/root';
import sendRoutes from './routes/send';
import templatesRoutes from './routes/templates';
import historyRoutes from './routes/history';
import syncRoutes from './routes/sync';

const rawOrigins = process.env['CORS_ORIGINS'] ?? '';
const corsOrigins = rawOrigins ? rawOrigins.split(',') : false;

export async function appWorkers(fastify: FastifyInstance) {
  await fastify.register(cors, {
    origin: corsOrigins,
    methods: ['GET', 'POST'],
  });

  await fastify.register(sensiblePlugin);
  await fastify.register(rootRoutes);
  await fastify.register(sendRoutes);
  await fastify.register(templatesRoutes);
  await fastify.register(historyRoutes);
  await fastify.register(syncRoutes);
}
