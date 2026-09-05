import path from 'path';
import { FastifyInstance } from 'fastify';
import AutoLoad from '@fastify/autoload';
import cors from '@fastify/cors';

export interface AppOptions {}

export async function app(fastify: FastifyInstance, _opts: AppOptions) {
  await fastify.register(cors, {
    origin: ['http://localhost:5173', 'http://localhost:19006'],
    methods: ['GET', 'POST'],
  });

  fastify.register(AutoLoad, {
    dir: path.join(__dirname, 'plugins'),
    options: {},
  });

  fastify.register(AutoLoad, {
    dir: path.join(__dirname, 'routes'),
    options: {},
  });
}
