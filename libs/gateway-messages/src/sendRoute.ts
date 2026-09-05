import { Hono } from 'hono';
import { randomUUID } from 'node:crypto';
import { templates } from '@griever/shared';
import type { SendEvent } from '@griever/shared';
import { sendSMS } from '@griever/sms';
import { recordEvent } from './sendEvents.js';

interface SendRequestBody {
  userId: string;
  templateId: string;
  contacts: string[];
  fields: Record<string, string>;
}

function isValidSendRequest(body: unknown): body is SendRequestBody {
  if (!body || typeof body !== 'object') return false;
  const b = body as Record<string, unknown>;
  return (
    typeof b['userId'] === 'string' &&
    b['userId'] !== '' &&
    typeof b['templateId'] === 'string' &&
    b['templateId'] !== '' &&
    Array.isArray(b['contacts']) &&
    b['contacts'].length > 0 &&
    b['contacts'].every((contact) => typeof contact === 'string') &&
    typeof b['fields'] === 'object' &&
    b['fields'] !== null
  );
}

export const sendRoute = new Hono().post('/send', async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!isValidSendRequest(body)) {
    return c.json({ error: 'Invalid request body' }, 400);
  }
  const { userId, templateId, contacts, fields } = body;

  const template = templates.find((t) => t.id === templateId);
  if (!template) {
    return c.json({ error: `Unknown template: ${templateId}` }, 400);
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
  return c.json(event);
});
