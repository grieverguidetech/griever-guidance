import { Hono } from 'hono';
import type { ObituaryRequest, ObituaryResponse } from '@griever/shared';

function isValidObituaryRequest(body: unknown): body is ObituaryRequest {
  if (!body || typeof body !== 'object') return false;
  const b = body as Record<string, unknown>;
  return (
    typeof b['fullName'] === 'string' &&
    b['fullName'] !== '' &&
    typeof b['dateOfBirth'] === 'string' &&
    b['dateOfBirth'] !== '' &&
    typeof b['dateOfPassing'] === 'string' &&
    b['dateOfPassing'] !== ''
  );
}

function buildPrompt(fields: ObituaryRequest): string {
  const lines = [
    `Full name: ${fields.fullName}`,
    `Date of birth: ${fields.dateOfBirth}`,
    `Date of passing: ${fields.dateOfPassing}`,
    fields.cityOfResidence ? `City of residence: ${fields.cityOfResidence}` : null,
    fields.survivors ? `Survived by: ${fields.survivors}` : null,
    fields.career ? `Career or vocation: ${fields.career}` : null,
    fields.personalNote ? `Memory or characteristic to include: ${fields.personalNote}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  return (
    `You are helping a grieving family write an obituary. ` +
    `Write a warm, dignified obituary of 150–200 words using the information below. ` +
    `Use a calm, respectful tone. Do not use exclamation points. ` +
    `Write in third person. Do not add information that was not provided.\n\n` +
    lines
  );
}

export const obituaryRoute = new Hono().post('/obituary', async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!isValidObituaryRequest(body)) {
    return c.json({ error: 'Invalid request body' }, 400);
  }

  const anthropicKey = process.env['ANTHROPIC_API_KEY'];
  if (!anthropicKey) {
    return c.json({ error: 'Obituary generation is not configured.' }, 500);
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
      messages: [{ role: 'user', content: buildPrompt(body) }],
    }),
  });

  if (!response.ok) {
    return c.json({ error: 'Could not generate obituary at this time.' }, 502);
  }

  const data = (await response.json()) as {
    content: Array<{ type: string; text: string }>;
  };
  const draft = data.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('');

  return c.json({ draft } satisfies ObituaryResponse);
});
