import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { checklistDetail, mergeChecklistDetails } from './checklistDetails';
import type { ChecklistDetail } from './checklistDetails';

const DIR = join(import.meta.dirname, '..', 'checklist');
const readJson = (name: string): unknown => JSON.parse(readFileSync(join(DIR, name), 'utf8'));
const files = ['details-early.json', 'details-later.json'];

function allStrings(value: unknown): string[] {
  if (typeof value === 'string') {
    return [value];
  }
  if (value !== null && typeof value === 'object') {
    return Object.values(value).flatMap(allStrings);
  }
  return [];
}

const entry: ChecklistDetail = { whatItIs: 'a', whyItMatters: 'b' };

describe('checklistDetail', () => {
  it('returns null for an unknown id', () => {
    expect(checklistDetail('no-such-item')).toBeNull();
    expect(checklistDetail('constructor')).toBeNull();
  });
});

describe('mergeChecklistDetails', () => {
  it('merges two files', () => {
    expect(Object.keys(mergeChecklistDetails({ a: entry }, { b: entry })).sort()).toEqual(['a', 'b']);
  });

  it('throws when an id is in both files', () => {
    expect(() => mergeChecklistDetails({ a: entry }, { a: entry })).toThrow(/both/);
  });
});

describe('checklist detail files', () => {
  const ajv = new Ajv2020({ allErrors: true, strict: true, validateFormats: false });
  const validate = ajv.compile(readJson('detail.schema.json') as object);

  it.each(files)('%s matches the schema', (file) => {
    expect(validate(readJson(file)), JSON.stringify(validate.errors)).toBe(true);
  });

  it('the schema accepts a full entry', () => {
    expect(validate({ a: { ...entry, whoToCall: 'x', whatToBring: 'y', doesNotApplyWhen: 'z', sources: ['https://example.com'] } })).toBe(true);
  });

  it('the schema rejects an entry with no whatItIs', () => {
    expect(validate({ a: { whyItMatters: 'b' } })).toBe(false);
  });

  it.each(files)('%s has no exclamation points', (file) => {
    for (const text of allStrings(readJson(file))) {
      expect(text).not.toContain('!');
    }
  });
});

describe('production behaviour and file overlap', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('keeps the early entry on a duplicate in production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    const early: ChecklistDetail = { whatItIs: 'early', whyItMatters: 'b' };
    const later: ChecklistDetail = { whatItIs: 'later', whyItMatters: 'b' };
    expect(mergeChecklistDetails({ a: early }, { a: later }).a).toBe(early);
  });

  it('has no id in both details-early.json and details-later.json', () => {
    const earlyIds = Object.keys(readJson('details-early.json') as object);
    const laterIds = Object.keys(readJson('details-later.json') as object);
    expect(earlyIds.filter((id) => laterIds.includes(id))).toEqual([]);
  });

  it('requires https for sources', () => {
    const ajv = new Ajv2020({ strict: true });
    const validate = ajv.compile(readJson('detail.schema.json') as object);
    expect(validate({ a: { ...entry, sources: ['http://example.com'] } })).toBe(false);
    expect(validate({ a: { ...entry, sources: ['https://example.com'] } })).toBe(true);
  });
});
