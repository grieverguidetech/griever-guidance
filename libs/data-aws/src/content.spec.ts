import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { BatchWriteCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { buildContent, CHECKLIST_SEED } from './content.js';
import { loadLocalConfig } from './config.js';
import { seedContent } from './seed.js';

const read = (path: string) =>
  readFileSync(fileURLToPath(new URL(`../../../${path}`, import.meta.url)), 'utf8');

interface ScreenItem {
  id: string;
  label: string;
  meta?: string;
  tip?: string;
}

/** Reads the CHECKLIST array of a screen: id, label, meta and tip (a string, or a const name). */
function parseChecklist(source: string): ScreenItem[] {
  const start = source.indexOf('const CHECKLIST');
  const body = source.slice(source.indexOf('= [', start), source.indexOf('\n];', start));
  const constant = (name: string) =>
    new RegExp(`const ${name}[^=]*=\\s*(["'])(.*?)\\1;`, 's').exec(source)?.[2];
  const field = (row: string, key: string) => {
    const literal = new RegExp(`\\b${key}: (["'])(.*?)\\1`).exec(row);
    if (literal) return literal[2];
    const name = new RegExp(`\\b${key}: ([A-Z_]+)`).exec(row)?.[1];
    return name ? constant(name) : undefined;
  };
  return body
    .split('\n')
    .filter((row) => row.includes('label:'))
    .map((row) => ({
      id: field(row, 'id') as string,
      label: field(row, 'label') as string,
      meta: field(row, 'meta'),
      tip: field(row, 'tip'),
    }));
}

const seedAsScreen = (): ScreenItem[] =>
  CHECKLIST_SEED.map((i) => ({ id: i.id, label: i.label, meta: i.reason, tip: i.tip }));

describe('parseChecklist', () => {
  it('reads id, label, meta and a tip held in a const', () => {
    const source = [
      'export const SSN_TIP =',
      '  "You\'ll need this number.";',
      'const CHECKLIST: ChecklistItem[] = [',
      "  { id: 'a', label: 'One', meta: 'Why' },",
      "  { id: 'b', label: 'Two', tip: SSN_TIP },",
      '];',
    ].join('\n');
    expect(parseChecklist(source)).toEqual([
      { id: 'a', label: 'One', meta: 'Why', tip: undefined },
      { id: 'b', label: 'Two', meta: undefined, tip: "You'll need this number." },
    ]);
  });
});

describe('checklist seed', () => {
  it('matches the web screen CHECKLIST in full: id, label, meta and tip', () => {
    const screen = parseChecklist(read('apps/web/src/screens/WhatYoullNeed.tsx'));
    expect(screen.length).toBeGreaterThan(0);
    expect(seedAsScreen()).toEqual(screen);
  });

  it('matches the mobile screen on label, meta and tip (its ids differ)', () => {
    const mobile = parseChecklist(read('apps/mobile/src/screens/WhatYoullNeedScreen.tsx'));
    expect(mobile.length).toBeGreaterThan(0);
    const strip = ({ label, meta, tip }: ScreenItem) => ({ label, meta, tip });
    expect(seedAsScreen().map(strip)).toEqual(mobile.map(strip));
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
    const count = await seedContent(doc, loadLocalConfig({}), items);
    expect(count).toBe(30);
    const sizes = sent.map((c) => c.input.RequestItems?.['gg-content']?.length);
    expect(sizes).toEqual([25, 5]);
  });
});
