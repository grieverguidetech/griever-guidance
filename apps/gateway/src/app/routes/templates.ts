import { FastifyInstance } from 'fastify';
import { templates } from '@griever/shared';

export default async function (fastify: FastifyInstance) {
  fastify.get('/templates', async () => {
    return templates.map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description,
      fields: t.fields,
    }));
  });
}
