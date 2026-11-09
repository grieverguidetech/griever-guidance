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
      // Obituary template brackets such as [DATE OF DEATH] are capitals on purpose.
      expect(text.replace(/\[[^\]]*\]/g, ''), text).not.toMatch(/\b[A-Z]{4,}\b/);
    }
  });
});

describe('the hub back button', () => {
  it('reads Home, because it leaves the person for Home (#380)', () => {
    expect(screenCopy('pathLanding').back).toBe('Home');
  });
});

describe('mobile-only hub copy (#654)', () => {
  it('keeps the web done label and adds the mobile one beside it', () => {
    const hub = screenCopy('pathLanding');
    expect(hub.moments.announce.doneLabel).toBe('Told close family');
    expect(hub.announcedLabel).toBe('Announced the passing');
  });

  it('names a missing field, with and without "the"', () => {
    const hub = screenCopy('pathLanding');
    expect(fill(hub.statusNeedsField, { field: hub.statusFieldNames['serviceTime'] })).toBe('Needs the service time');
    expect(fill(hub.statusNeedsField, { field: hub.statusFieldNames['senderName'] })).toBe('Needs your name');
  });

  it('has the Bring back my words button for the review screen', () => {
    expect(screenCopy('review').bringBack).toBe('Bring back my words');
    expect(screenCopy('review').suggestedInPlace).toBe('Suggested wording in place.');
    expect(screenCopy('review').wordsBack).toBe('Your words are back.');
  });
});

describe('fill', () => {
  it('fills {name} placeholders', () => {
    expect(fill(screenCopy('pathLanding').forName, { name: 'Margaret' })).toBe('For Margaret');
  });

  it('fills the {section} placeholder in the shell Next link', () => {
    expect(fill(screenCopy('cmsShell').next, { section: 'The person' })).toBe('Next: The person');
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

  it('keeps every bracket when all fields are empty', () => {
    expect(buildObituaryDraft({}, copy)).toBe(
      [
        '[GIVEN NAME] [MIDDLE NAME (AND NICKNAME)] [SURNAME], [AGE], of [CITY], [STATE], passed away on [DATE OF DEATH] in [LOCATION OF DEATH].',
        "Funeral service will be held at [LOCATION] on [DATE] at [TIME] with [OFFICIANT] of [PLACE OF WORSHIP] officiating. Burial will follow at [CEMETERY NAME], [CEMETERY LOCATION]. Visitation will be held at [LOCATION] on [DATE] at [TIME]. [NAME OF FUNERAL HOME] will be handling the funeral arrangements.",
        "[NAME] was born in [LOCATION OF BIRTH] to [PARENTS' NAMES] on [DATE OF BIRTH]. [He/She] went to high school at [SCHOOL NAME] and graduated in [YEAR]. [He/She] went on to earn a degree or certificate in [DEGREE TYPE] from [SCHOOL NAME]. [He/She] worked as a [JOB TYPE] for [COMPANY] for [NUMBER OF YEARS]. [He/She] enjoyed [ACTIVITIES/HOBBIES]. [He/She] received [AWARDS/HONORS] and was involved in [CHARITIES/ORGANIZATIONS].",
        '[NAME] is survived by [his/her] [RELATION], [NAME] of [CITY]. [He/She] is preceded in death by [his/her] [RELATION], [NAME].',
        'Memorial donations may be made to [ORGANIZATION NAME], [MAILING ADDRESS]. The family wishes to extend their gratitude to [ORGANIZATION/NAME]. [FINAL WORDS]',
      ].join('\n\n'),
    );
  });

  const filled = {
    personName: 'Margaret Ellen Hayes',
    obituaryCity: 'Boston',
    dateOfPassing: 'June 7, 2025',
    servicePlace: 'St. Mark Church',
    serviceDate: 'June 10, 2025',
    serviceTime: '2:00 PM',
    serviceOfficiant: 'Reverend John Cole',
    burialPlace: 'Oak Hill Cemetery',
    visitationPlace: 'Hayes Home',
    visitationDate: 'June 9, 2025',
    visitationTime: '6:00 PM',
    birthDate: 'March 2, 1941',
    obituaryCareer: 'a teacher for Boston Schools for 30 years',
    obituarySurvivors: 'her husband, John of Boston',
    obituaryNote: 'She will be missed.',
  };

  it('leaves only the brackets that have no source field when every field is filled', () => {
    const draft = buildObituaryDraft(filled, copy);
    expect(draft).toContain('Margaret Ellen Hayes, [AGE], of Boston, [STATE], passed away on June 7, 2025 in [LOCATION OF DEATH].');
    expect(draft).toContain(
      'Funeral service will be held at St. Mark Church on June 10, 2025 at 2:00 PM with Reverend John Cole of [PLACE OF WORSHIP] officiating. Burial will follow at Oak Hill Cemetery, [CEMETERY LOCATION]. Visitation will be held at Hayes Home on June 9, 2025 at 6:00 PM.',
    );
    expect(draft).toContain('Margaret Ellen Hayes was born in [LOCATION OF BIRTH] to [PARENTS\' NAMES] on March 2, 1941.');
    expect(draft).toContain('[He/She] worked as a teacher for Boston Schools for 30 years.');
    expect(draft).toContain('Margaret Ellen Hayes is survived by her husband, John of Boston.');
    expect(draft.endsWith('[ORGANIZATION/NAME]. She will be missed.')).toBe(true);
    for (const blank of ['[GIVEN NAME]', '[CITY]', '[DATE OF DEATH]', '[LOCATION]', '[DATE]', '[TIME]', '[OFFICIANT]', '[CEMETERY NAME]', '[DATE OF BIRTH]', '[JOB TYPE]', '[FINAL WORDS]']) {
      expect(draft).not.toContain(blank);
    }
  });

  it('writes "Burial will be private." when the burial is private', () => {
    const draft = buildObituaryDraft({ ...filled, burialPrivate: true }, copy);
    expect(draft).toContain('officiating. Burial will be private. Visitation');
    expect(draft).not.toContain('Oak Hill Cemetery');
    expect(draft).not.toContain('[CEMETERY');
  });

  it('does not double a full stop typed at the end of a field', () => {
    const draft = buildObituaryDraft({ ...filled, obituaryCity: 'Boston.', obituarySurvivors: 'her husband.', obituaryCareer: 'a nurse.' }, copy);
    expect(draft).not.toContain('..');
    expect(draft).toContain('is survived by her husband.');
  });

  it('treats fields with only spaces as empty', () => {
    const spaces = Object.fromEntries(Object.keys(filled).map((key) => [key, ' \t\n ']));
    expect(buildObituaryDraft(spaces, copy)).toBe(buildObituaryDraft({}, copy));
  });

  it('never writes the template instruction notes into the text', () => {
    const draft = buildObituaryDraft(filled, copy);
    expect(draft).not.toMatch(/list all|list predeceased/i);
  });
});
