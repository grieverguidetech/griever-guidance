import { FastifyInstance } from 'fastify';
import { templates } from '@griever/shared';
import type { SendEvent } from '@griever/shared';
import { sendSMS } from '@griever/sms';
import { randomUUID } from 'crypto';
import { recordEvent } from './history.js';

const sendBodySchema = {
  type: 'object',
  required: ['userId', 'templateId', 'contacts', 'fields'],
  properties: {
    userId: { type: 'string', minLength: 1 },
    templateId: { type: 'string', minLength: 1 },
    contacts: { type: 'array', items: { type: 'string' }, minItems: 1 },
    fields: { type: 'object', additionalProperties: { type: 'string' } },
  },
} as const;

export default async function (fastify: FastifyInstance) {
  fastify.post<{
    Body: {
      userId: string;
      templateId: string;
      contacts: string[];
      fields: Record<string, string>;
    };
  }>(
    '/send',
    { schema: { body: sendBodySchema } },
    async (request, reply) => {
      const { userId, templateId, contacts, fields } = request.body;

      const template = templates.find((t) => t.id === templateId);
      if (!template) {
        return reply.status(400).send({ error: `Unknown template: ${templateId}` });
      }

      const message = template.renderMessage(fields);

      await Promise.all(contacts.map((phone) => sendSMS(phone, message)));

      const event: SendEvent = {
        id: randomUUID(),
        userId,
        templateId,
        recipientCount: contacts.length,
        status: 'sent',
        createdAt: new Date().toISOString(),
        deceasedName: fields['deceasedName'] ?? '',
        serviceDate: fields['serviceDate'] ?? fields['eventDate'] ?? '',
        serviceLocation: fields['serviceLocation'] ?? fields['eventLocation'] ?? '',
        wakeTime: fields['wakeTime'],
      };

      recordEvent(event);
      return event;
    }
  );
}
