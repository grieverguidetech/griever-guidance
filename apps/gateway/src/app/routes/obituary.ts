import { FastifyInstance } from 'fastify';
import type { ObituaryRequest, ObituaryResponse } from '@griever/shared';

const bodySchema = {
  type: 'object',
  required: ['fullName', 'dateOfBirth', 'dateOfPassing'],
  properties: {
    fullName:        { type: 'string', minLength: 1 },
    dateOfBirth:     { type: 'string', minLength: 1 },
    dateOfPassing:   { type: 'string', minLength: 1 },
    cityOfResidence: { type: 'string' },
    survivors:       { type: 'string' },
    career:          { type: 'string' },
    personalNote:    { type: 'string' },
  },
} as const;

function buildPrompt(fields: ObituaryRequest): string {
  const lines = [
    `Full name: ${fields.fullName}`,
    `Date of birth: ${fields.dateOfBirth}`,
    `Date of passing: ${fields.dateOfPassing}`,
    fields.cityOfResidence ? `City of residence: ${fields.cityOfResidence}` : null,
    fields.survivors       ? `Survived by: ${fields.survivors}` : null,
    fields.career          ? `Career or vocation: ${fields.career}` : null,
    fields.personalNote    ? `Memory or characteristic to include: ${fields.personalNote}` : null,
  ].filter(Boolean).join('\n');

  return (
    `You are helping a grieving family write an obituary. ` +
    `Write a warm, dignified obituary of 150–200 words using the information below. ` +
    `Use a calm, respectful tone. Do not use exclamation points. ` +
    `Write in third person. Do not add information that was not provided.\n\n` +
    lines
  );
}

export default async function (fastify: FastifyInstance) {
  fastify.post<{ Body: ObituaryRequest }>(
    '/obituary',
    { schema: { body: bodySchema } },
    async (request, reply): Promise<ObituaryResponse> => {
      const anthropicKey = process.env['ANTHROPIC_API_KEY'];
      if (!anthropicKey) {
        return reply.status(500).send({ error: 'Obituary generation is not configured.' });
      }

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': anthropicKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 600,
          messages: [{ role: 'user', content: buildPrompt(request.body) }],
        }),
      });

      if (!response.ok) {
        return reply.status(502).send({ error: 'Could not generate obituary at this time.' });
      }

      const data = await response.json() as {
        content: Array<{ type: string; text: string }>;
      };

      const draft = data.content
        .filter((b) => b.type === 'text')
        .map((b) => b.text)
        .join('');

      return { draft };
    }
  );
}
