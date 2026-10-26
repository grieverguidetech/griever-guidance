import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { announceRecap, doneRowMeta, fill, findHardCodedCopy, screenCopy, screenNames } from './index';

const SCREENS_DIR = join(import.meta.dirname, '..', 'screens');
const SCHEMAS_DIR = join(import.meta.dirname, '..', 'schemas');

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

describe('findHardCodedCopy', () => {
  const found = (source: string) => findHardCodedCopy(source, 'pathLanding');

  it('finds a string literal in any quote style', () => {
    expect(found("const t = 'One thing at a time.';")).toEqual(['One thing at a time.']);
    expect(found('const t = "One thing at a time.";')).toEqual(['One thing at a time.']);
    expect(found('const t = `One thing at a time.`;')).toEqual(['One thing at a time.']);
  });

  it('finds JSX text, including across lines', () => {
    expect(found('<h1>One thing at a time.</h1>')).toEqual(['One thing at a time.']);
    expect(found('<h1>\n  One thing at a time.\n</h1>')).toEqual(['One thing at a time.']);
  });

  it('finds a template with a placeholder written as ${name} or {name}', () => {
    expect(found('const t = `For ${person.name}`;')).toEqual(['For {name}']);
    expect(found('<p>For {name}</p>')).toEqual(['For {name}']);
  });

  it('treats straight, curly and HTML-escaped apostrophes the same', () => {
    expect(found("<h2>What you\u2019ll need</h2>")).toEqual(["What you'll need"]);
    expect(found('<h2>What you&apos;ll need</h2>')).toEqual(["What you'll need"]);
    expect(found('<h2>What you&#39;ll need</h2>')).toEqual(["What you'll need"]);
  });

  it('ignores copy read from the JSON and unrelated code', () => {
    expect(found('<h1>{copy.heading}</h1>')).toEqual([]);
    expect(found("const heading = copy.heading; if (a === 'x') {}")).toEqual([]);
  });

  it('ignores single lowercase words, which are usually code (status keys, roles)', () => {
    expect(found("if (kind === 'start') { return 'person'; }")).toEqual([]);
  });

  it('still finds a capitalised single word', () => {
    expect(found("const label = 'Back';")).toEqual(['Back']);
  });
});

describe('doneRowMeta', () => {
  const copy = screenCopy('pathLanding');

  it('says one person, with the date and Send again', () => {
    expect(doneRowMeta(copy, { recipientCount: 1, dateLabel: 'May 30, 2026', started: false })).toBe(
      '1 person · May 30, 2026 · Send again',
    );
  });

  it('says people, leaves out a missing date, and shows Started', () => {
    expect(doneRowMeta(copy, { recipientCount: 3, started: true })).toBe('3 people · Started');
  });
});

describe('announceRecap', () => {
  const copy = screenCopy('announce');

  it('joins name, date and sender', () => {
    expect(announceRecap({ personName: 'Margaret Hayes', dateOfPassing: 'May 29, 2026', senderName: 'Peter' }, copy)).toBe(
      'Margaret Hayes · passed May 29, 2026 · from Peter',
    );
  });

  it('says the date is not set, and leaves out a missing sender', () => {
    expect(announceRecap({ personName: 'Margaret Hayes', dateOfPassing: ' ', senderName: '' }, copy)).toBe(
      'Margaret Hayes · date not set',
    );
  });

  it('falls back when there is no name', () => {
    expect(announceRecap({ personName: '', dateOfPassing: 'May 29, 2026', senderName: 'Peter' }, copy)).toBe(
      'Their name · passed May 29, 2026 · from Peter',
    );
  });
});
