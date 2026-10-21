import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { BatchWriteCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { buildContent, CHECKLIST_SEED } from './content.js';
import { loadAwsConfig } from './config.js';
import { seedContent } from './seed.js';

const screen = readFileSync(
  fileURLToPath(new URL('../../../apps/web/src/screens/WhatYoullNeed.tsx', import.meta.url)),
  'utf8',
);

describe('checklist seed', () => {
  it('has every id and label of the screen CHECKLIST, and no extra', () => {
    const block = screen.slice(screen.indexOf('const CHECKLIST'), screen.indexOf('];'));
    const screenIds = [...block.matchAll(/id: '([^']+)'/g)].map((m) => m[1]);
    expect(screenIds.length).toBeGreaterThan(0);
    expect(CHECKLIST_SEED.map((item) => item.id)).toEqual(screenIds);
    for (const item of CHECKLIST_SEED) {
      expect(block).toContain(`label: '${item.label}'`);
      if (item.reason) expect(block).toContain(item.reason);
    }
  });

  it('stores one checklist item per entry, in order, with a version', () => {
    const items = buildContent().filter((i) => i.kind === 'checklist');
    expect(items.map((i) => i.id)).toEqual(CHECKLIST_SEED.map((i) => i.id));
    expect(items.map((i) => i.order)).toEqual(items.map((_, index) => index + 1));
    expect(items.every((i) => i.version === 1 && i.hidden === false)).toBe(true);
  });
});

describe('sample and example seed', () => {
  const content = buildContent();
  const text = (kind: string, id: string) =>
    content.find((i) => i.kind === kind && i.id === id)?.text;

  it('has the plan v4 sample and example ids', () => {
    expect(content.filter((i) => i.kind === 'sample').map((i) => i.id)).toEqual([
      'announcement',
      'service',
      'thank-you',
    ]);
    expect(content.filter((i) => i.kind === 'example').map((i) => i.id)).toEqual(['service-message']);
  });

  it('renders the text from the shared templates', () => {
    expect(text('sample', 'announcement')).toContain('Margaret Hayes passed away');
    expect(text('sample', 'service')).toContain('service will be held');
    expect(text('sample', 'thank-you')).toContain('thank you');
    expect(text('example', 'service-message')).toContain('Reception to follow');
  });

  it('has no exclamation point and no leftover "undefined" (calm copy, C7)', () => {
    for (const item of content) {
      expect(`${item.label} ${item.text ?? ''} ${item.reason ?? ''}`).not.toMatch(/!|undefined/);
    }
  });

  it('has a unique kind and id for every item', () => {
    const keys = content.map((i) => `${i.kind}/${i.id}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('seedContent', () => {
  it('writes every item, 25 at a time', async () => {
    const sent: BatchWriteCommand[] = [];
    const doc = {
      send: async (command: BatchWriteCommand) => {
        sent.push(command);
      },
    } as unknown as DynamoDBDocumentClient;
    const items = Array.from({ length: 30 }, (_, n) => ({
      kind: 'checklist' as const,
      id: `item-${n}`,
      version: 1,
      label: 'x',
    }));
    const count = await seedContent(doc, loadAwsConfig({}), items);
    expect(count).toBe(30);
    const sizes = sent.map((c) => c.input.RequestItems?.['gg-content']?.length);
    expect(sizes).toEqual([25, 5]);
  });
});
