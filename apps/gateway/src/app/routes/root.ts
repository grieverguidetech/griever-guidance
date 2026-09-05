import { FastifyInstance } from 'fastify';

export default async function (fastify: FastifyInstance) {
  fastify.get('/health', async () => {
    return { ok: true };
  });
}
