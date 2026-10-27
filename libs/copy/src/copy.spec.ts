import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { announceRecap, buildObituaryDraft, doneRowMeta, fill, findHardCodedCopy, screenCopy, screenNames, sendLabel } from './index';

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

describe('the hub back button', () => {
  it('reads Home, because it leaves the person for Home (#380)', () => {
    expect(screenCopy('pathLanding').back).toBe('Home');
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
    expect(found("const label = 'Start';")).toEqual(['Start']);
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

describe('sendLabel', () => {
  const copy = screenCopy('review');

  it('says one person', () => {
    expect(sendLabel(1, copy)).toBe('Text 1 person');
  });

  it('says people', () => {
    expect(sendLabel(2, copy)).toBe('Text 2 people');
  });

  it('falls back when there is no count to show', () => {
    expect(sendLabel(undefined, copy)).toBe('Text these people');
    expect(sendLabel(0, copy)).toBe('Text these people');
  });
});

describe('buildObituaryDraft', () => {
  const copy = screenCopy('obituaryDraft');

  it('writes every sentence when every field is filled', () => {
    const draft = buildObituaryDraft(
      {
        fullName: 'Margaret Ellen Hayes',
        dateOfBirth: 'March 2, 1941',
        dateOfPassing: 'June 7, 2025',
        cityOfResidence: 'Boston, MA',
        career: 'retired schoolteacher',
        survivors: 'husband John, two daughters',
        personalNote: 'She made everyone feel at home.',
      },
      copy,
    );
    expect(draft).toBe(
      [
        'Margaret Ellen Hayes died on June 7, 2025. They were born on March 2, 1941.',
        'Margaret Ellen Hayes lived in Boston, MA. Their work: retired schoolteacher. She made everyone feel at home.',
        'Survived by husband John, two daughters. Margaret Ellen Hayes will be remembered with love.',
      ].join('\n\n'),
    );
  });

  it('writes only the name, the opening and the closing line', () => {
    expect(buildObituaryDraft({ fullName: 'Margaret Ellen Hayes' }, copy)).toBe(
      'Margaret Ellen Hayes has died.\n\nMargaret Ellen Hayes will be remembered with love.',
    );
  });

  it('adds both dates when the name and both dates are given', () => {
    expect(
      buildObituaryDraft(
        { fullName: 'Margaret Ellen Hayes', dateOfBirth: 'March 2, 1941', dateOfPassing: 'June 7, 2025' },
        copy,
      ),
    ).toBe(
      'Margaret Ellen Hayes died on June 7, 2025. They were born on March 2, 1941.\n\nMargaret Ellen Hayes will be remembered with love.',
    );
  });

  it('keeps the birth date when the date of passing is missing', () => {
    expect(buildObituaryDraft({ fullName: 'Margaret Ellen Hayes', dateOfBirth: 'March 2, 1941' }, copy)).toBe(
      'Margaret Ellen Hayes has died. They were born on March 2, 1941.\n\nMargaret Ellen Hayes will be remembered with love.',
    );
  });

  it('writes survivors when there is no career', () => {
    expect(
      buildObituaryDraft(
        { fullName: 'Margaret Ellen Hayes', cityOfResidence: 'Boston, MA', survivors: 'husband John, two daughters' },
        copy,
      ),
    ).toBe(
      'Margaret Ellen Hayes has died.\n\nMargaret Ellen Hayes lived in Boston, MA.\n\nSurvived by husband John, two daughters. Margaret Ellen Hayes will be remembered with love.',
    );
  });

  it('treats fields with only spaces as empty', () => {
    expect(
      buildObituaryDraft(
        {
          fullName: 'Margaret Ellen Hayes',
          dateOfBirth: '  ',
          dateOfPassing: '\t',
          cityOfResidence: ' ',
          career: '\n',
          survivors: '   ',
          personalNote: ' ',
        },
        copy,
      ),
    ).toBe('Margaret Ellen Hayes has died.\n\nMargaret Ellen Hayes will be remembered with love.');
  });

  it('adds a full stop to a memory the person did not end', () => {
    expect(buildObituaryDraft({ fullName: 'Margaret Ellen Hayes', personalNote: 'She loved to garden' }, copy)).toContain(
      'She loved to garden.',
    );
  });

  it('does not double a full stop the person typed at the end of a field', () => {
    expect(
      buildObituaryDraft(
        {
          fullName: 'Margaret Ellen Hayes',
          dateOfBirth: 'March 2, 1941.',
          dateOfPassing: 'June 7, 2025.',
          cityOfResidence: 'Boston, MA.',
          career: 'retired schoolteacher.',
          survivors: 'husband John.',
        },
        copy,
      ),
    ).toBe(
      [
        'Margaret Ellen Hayes died on June 7, 2025. They were born on March 2, 1941.',
        'Margaret Ellen Hayes lived in Boston, MA. Their work: retired schoolteacher.',
        'Survived by husband John. Margaret Ellen Hayes will be remembered with love.',
      ].join('\n\n'),
    );
  });
});
