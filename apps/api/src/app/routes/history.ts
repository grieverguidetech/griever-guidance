import { FastifyInstance } from 'fastify';
import type { SendEvent } from '@griever/shared';

// Resets when the server restarts — intentional for now.
const sendEvents: SendEvent[] = [];

export function recordEvent(event: SendEvent): void {
  sendEvents.unshift(event);
}

export default async function (fastify: FastifyInstance) {
  fastify.get<{ Params: { userId: string } }>(
    '/history/:userId',
    async (request): Promise<SendEvent[]> => {
      const { userId } = request.params;
      return sendEvents.filter((e) => e.userId === userId);
    }
  );
}
