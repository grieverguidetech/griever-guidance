import { Hono } from 'hono';
import { templates } from '@griever/shared';

export const templatesRoute = new Hono().get('/templates', (c) =>
  c.json(
    templates.map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description,
      fields: t.fields,
    })),
  ),
);
