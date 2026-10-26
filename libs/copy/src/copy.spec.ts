import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { fill, screenCopy, screenNames } from './index';

const SCREENS_DIR = join(import.meta.dirname, '..', 'screens');
const SCHEMAS_DIR = join(import.meta.dirname, '..', 'schemas');
const ROOT = join(import.meta.dirname, '..', '..', '..');

const readJson = (path: string): unknown => JSON.parse(readFileSync(path, 'utf8'));
const screenFiles = readdirSync(SCREENS_DIR).filter((name) => name.endsWith('.json'));

/** Every string in a JSON value, however deeply nested. */
function allStrings(value: unknown): string[] {
  if (typeof value === 'string') {
    return [value];
  }
  if (value !== null && typeof value === 'object') {
    return Object.values(value).flatMap(allStrings);
  }
  return [];
}

describe('screen copy files', () => {
  it('finds the files, so the checks below are not vacuous', () => {
    expect(screenFiles.length).toBeGreaterThan(0);
  });

  it('loads every file through the typed loader', () => {
    const names = screenFiles.map((file) => file.replace('.json', '')).sort();
    expect([...screenNames].sort()).toEqual(names);
  });

  it.each(screenFiles)('%s matches its JSON Schema', (file) => {
    const ajv = new Ajv2020({ allErrors: true, strict: true });
    const validate = ajv.compile(readJson(join(SCHEMAS_DIR, file.replace('.json', '.schema.json'))) as object);
    const ok = validate(readJson(join(SCREENS_DIR, file)));
    expect(ok, JSON.stringify(validate.errors)).toBe(true);
  });

  it('rejects copy that does not match (a missing key)', () => {
    const ajv = new Ajv2020({ strict: true });
    const validate = ajv.compile(readJson(join(SCHEMAS_DIR, 'pathLanding.schema.json')) as object);
    const { heading: _heading, ...incomplete } = screenCopy('pathLanding');
    expect(validate(incomplete)).toBe(false);
  });
});

describe('screen copy is calm (C7)', () => {
  it.each(screenFiles)('%s has no exclamation points and no all-caps shouting', (file) => {
    for (const text of allStrings(readJson(join(SCREENS_DIR, file)))) {
      expect(text, text).not.toContain('!');
      expect(text, text).not.toMatch(/\b[A-Z]{4,}\b/);
    }
  });
});

describe('fill', () => {
  it('fills {name} placeholders', () => {
    expect(fill(screenCopy('pathLanding').forName, { name: 'Margaret' })).toBe('For Margaret');
  });

  it('fills the same placeholder twice and accepts numbers', () => {
    expect(fill('{n} of {n}', { n: 2 })).toBe('2 of 2');
  });

  it('throws on a missing value outside production', () => {
    expect(() => fill('For {name}', {})).toThrow('Missing value for {name}');
  });

  it('leaves the placeholder in a production build', () => {
    vi.stubEnv('NODE_ENV', 'production');
    try {
      expect(fill('For {name}', {})).toBe('For {name}');
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

/**
 * The migration guard. A screen on this list now takes its words from libs/copy, so its source must
 * not hold any of them as a literal. Add a screen here in the same PR that migrates it.
 */
const MIGRATED_SCREENS: { copy: (typeof screenNames)[number]; sources: string[] }[] = [];

/** True when `source` holds `text` as a string literal or as JSX text. */
function hardCodes(source: string, text: string): boolean {
  const escaped = text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`['"\`]${escaped}['"\`]|>\\s*${escaped}\\s*<`).test(source);
}

describe('migrated screens do not hard-code copy', () => {
  it('detects a literal and JSX text, and ignores unrelated code', () => {
    expect(hardCodes("const t = 'One thing at a time.';", 'One thing at a time.')).toBe(true);
    expect(hardCodes('<h1>One thing at a time.</h1>', 'One thing at a time.')).toBe(true);
    expect(hardCodes('<h1>{copy.heading}</h1>', 'One thing at a time.')).toBe(false);
  });

  it.each(MIGRATED_SCREENS.flatMap((entry) => entry.sources.map((source) => [entry.copy, source] as const)))(
    '%s: %s',
    (name, source) => {
      const text = readFileSync(join(ROOT, source), 'utf8');
      const hardCoded = allStrings(screenCopy(name)).filter((value) => hardCodes(text, value));
      expect(hardCoded).toEqual([]);
    },
  );
});
