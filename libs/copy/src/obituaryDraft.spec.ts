import { buildObituaryDraft, findTemplateBlanks, hasTemplateBlanks, screenCopy } from './index';
import type { ObituaryDraftFields } from './index';

const copy = screenCopy('obituaryDraft');
const build = (fields: ObituaryDraftFields): string => buildObituaryDraft(fields, copy);
const paragraphs = (fields: ObituaryDraftFields): string[] => build(fields).split('\n\n');

const filled: ObituaryDraftFields = {
  obituaryGivenName: 'Margaret',
  obituaryMiddleName: 'Ellen',
  obituarySurname: 'Hayes',
  obituaryAge: '84',
  obituaryCity: 'Boston',
  obituaryState: 'MA',
  obituaryDeathPlace: 'Mercy Hospital',
  dateOfPassing: 'June 7, 2025',
  servicePlace: 'St. Mark Church',
  serviceDate: 'June 10, 2025',
  serviceTime: '2:00 PM',
  serviceOfficiant: 'Pastor John Cole',
  obituaryChurch: 'St. Mark',
  burialPlace: 'Oak Hill Cemetery',
  obituaryCemeteryLocation: 'Boston, MA',
  visitationPlace: 'Hayes Home',
  visitationDate: 'June 9, 2025',
  visitationTime: '6:00 PM',
  obituaryFuneralHome: 'Dunn Funeral Home',
  obituaryBirthPlace: 'Salem, MA',
  obituaryMotherName: 'Ruth Hayes',
  obituaryFatherName: 'Paul Hayes',
  birthDate: 'March 2, 1941',
  obituaryHighSchool: 'Salem High School',
  obituaryGradYear: '1959',
  obituaryDegree: 'Bachelor of Arts',
  obituaryCollege: 'Boston College',
  obituaryJobTitle: 'teacher',
  obituaryCompany: 'Boston Schools',
  obituaryJobYears: '30',
  obituaryHobbies: 'gardening and chess',
  obituaryAwards: 'the Teacher of the Year award',
  obituaryOrganizations: 'the parish choir',
  obituaryPronoun: 'she',
};

describe('buildObituaryDraft: empty', () => {
  it('keeps every core bracket and writes no optional sentence', () => {
    expect(build({})).toBe(
      [
        '[GIVEN NAME] [SURNAME], [AGE], of [CITY], [STATE], passed away on [DATE OF DEATH].',
        "Funeral service will be held at [SERVICE LOCATION] on [SERVICE DATE] at [SERVICE TIME] with [OFFICIANT] of [CHURCH] officiating. Burial will follow at [CEMETERY NAME], [CEMETERY LOCATION]. Visitation will be held at [VISITATION LOCATION] on [VISITATION DATE] at [VISITATION TIME].",
        "[NAME] was born in [BIRTH PLACE] to [MOTHER'S NAME] and [FATHER'S NAME] on [DATE OF BIRTH]. [He/She] went to high school at [HIGH SCHOOL] and graduated in [GRADUATION YEAR]. [He/She] worked as a [JOB TITLE] for [COMPANY] for [NUMBER OF YEARS].",
        '[NAME] is survived by [his/her] [RELATION], [NAME] of [CITY]. [He/She] is preceded in death by [his/her] [RELATION], [NAME].',
        'Memorial donations may be made to [ORGANIZATION NAME], [MAILING ADDRESS]. The family wishes to extend their gratitude to [ORGANIZATION/NAME]. [FINAL WORDS]',
      ].join('\n\n'),
    );
  });

  it('treats fields with only spaces as empty', () => {
    const spaces = Object.fromEntries(Object.entries(filled).map(([key, value]) => [key, typeof value === 'string' ? ' \t\n ' : value]));
    expect(build({ ...spaces, burialPrivate: false })).toBe(build({}));
  });

  it('gives each slot its own bracket word', () => {
    const { survivors: _survivors, note: _note, ...slots } = copy.blanks;
    const words = Object.values(slots);
    expect(new Set(words).size).toBe(words.length);
  });
});

describe('buildObituaryDraft: filled', () => {
  it('fills paragraphs 1 to 3 and leaves no core bracket', () => {
    const [p1, p2, p3] = paragraphs(filled);
    expect(p1).toBe('Margaret Ellen Hayes, 84, of Boston, MA, passed away on June 7, 2025 in Mercy Hospital.');
    expect(p2).toBe(
      'Funeral service will be held at St. Mark Church on June 10, 2025 at 2:00 PM with Pastor John Cole of St. Mark officiating. Burial will follow at Oak Hill Cemetery, Boston, MA. Visitation will be held at Hayes Home on June 9, 2025 at 6:00 PM. Dunn Funeral Home will be handling the funeral arrangements.',
    );
    expect(p3).toBe(
      "Margaret was born in Salem, MA to Ruth Hayes and Paul Hayes on March 2, 1941. She went to high school at Salem High School and graduated in 1959. She went on to earn a Bachelor of Arts from Boston College. She worked as a teacher for Boston Schools for 30 years. She enjoyed gardening and chess. She received the Teacher of the Year award and was involved in the parish choir.",
    );
    expect([p1, p2, p3].join(' ')).not.toMatch(/\[/);
  });

  it('writes the officiant as typed, with no "Reverend" added', () => {
    expect(paragraphs({ ...filled, serviceOfficiant: 'John Cole' })[1]).toContain('with John Cole of St. Mark officiating');
  });

  it('writes "Burial will be private." when the burial is private', () => {
    const p2 = paragraphs({ ...filled, burialPrivate: true })[1];
    expect(p2).toContain('officiating. Burial will be private. Visitation');
    expect(p2).not.toContain('Oak Hill');
  });

  it('never has a "!", a double space or a double full stop', () => {
    for (const fields of [{}, filled, { ...filled, obituaryCity: 'Boston.', obituaryAwards: 'a medal.' }]) {
      const text = build(fields);
      expect(text).not.toContain('!');
      expect(text).not.toContain('  ');
      expect(text).not.toContain('..');
    }
  });

  it('keeps a full stop typed inside a sentence', () => {
    const text = build({ ...filled, serviceTime: '2:00 p.m.', visitationTime: '6 p.m.', serviceOfficiant: 'Pastor John Cole Sr.' });
    expect(text).toContain('at 2:00 p.m. with Pastor John Cole Sr. of St. Mark');
    expect(text).toContain('at 6 p.m. Dunn Funeral Home will be');
  });
});

describe('buildObituaryDraft: parts that drop out', () => {
  it('drops the middle name without a double space', () => {
    expect(paragraphs({ ...filled, obituaryMiddleName: '' })[0]).toMatch(/^Margaret Hayes, 84,/);
  });

  it('drops "in [place]" when the place of death is empty', () => {
    expect(paragraphs({ ...filled, obituaryDeathPlace: '' })[0]).toBe('Margaret Ellen Hayes, 84, of Boston, MA, passed away on June 7, 2025.');
  });

  it('drops the funeral home sentence when empty', () => {
    const p2 = paragraphs({ ...filled, obituaryFuneralHome: '' })[1];
    expect(p2.endsWith('at 6:00 PM.')).toBe(true);
  });

  it('drops the degree sentence only when degree and college are both empty', () => {
    expect(paragraphs({ ...filled, obituaryDegree: '', obituaryCollege: '' })[2]).not.toContain('went on to earn');
    expect(paragraphs({ ...filled, obituaryDegree: '' })[2]).toContain('earn a [DEGREE] from Boston College.');
    expect(paragraphs({ ...filled, obituaryCollege: '' })[2]).toContain('earn a Bachelor of Arts from [COLLEGE].');
    expect(paragraphs({ ...filled, obituaryDegree: 'Associate degree' })[2]).toContain('earn an Associate degree from');
  });

  it('drops the hobbies sentence when empty', () => {
    expect(paragraphs({ ...filled, obituaryHobbies: '' })[2]).not.toContain('enjoyed');
  });

  it('drops awards and organizations alone, and together', () => {
    expect(paragraphs({ ...filled, obituaryOrganizations: '' })[2]).toMatch(/She received the Teacher of the Year award\.$/);
    expect(paragraphs({ ...filled, obituaryAwards: '' })[2]).toMatch(/She was involved in the parish choir\.$/);
    const none = paragraphs({ ...filled, obituaryAwards: '', obituaryOrganizations: '' })[2];
    expect(none).not.toMatch(/received|involved/);
    expect(none.endsWith('She enjoyed gardening and chess.')).toBe(true);
  });
});

describe('buildObituaryDraft: age', () => {
  it('uses the typed age first', () => {
    expect(paragraphs({ ...filled, obituaryAge: '85' })[0]).toContain(', 85, of');
  });

  it('works the age out from the two dates when none is typed', () => {
    expect(paragraphs({ ...filled, obituaryAge: '' })[0]).toContain(', 84, of');
    expect(paragraphs({ ...filled, obituaryAge: '', birthDate: '2025-06-07' })[0]).toContain(', 0, of');
    expect(paragraphs({ ...filled, obituaryAge: '', birthDate: '6/7/1941' })[0]).toContain(', 84, of');
    expect(paragraphs({ ...filled, obituaryAge: '', birthDate: '6/8/1941' })[0]).toContain(', 83, of');
  });

  it('keeps [AGE] when a date is partial, impossible or in the wrong order', () => {
    for (const birthDate of ['1941', 'March 2', 'Feb 30, 1941', 'June 8, 2025', '']) {
      expect(paragraphs({ ...filled, obituaryAge: '', birthDate })[0]).toContain(', [AGE], of');
    }
  });
});

describe('buildObituaryDraft: pronoun', () => {
  const { obituaryPronoun: _pronoun, ...noPronoun } = filled;

  it('uses He for he and She for she', () => {
    expect(paragraphs({ ...filled, obituaryPronoun: 'he' })[2]).toContain('He went to high school');
    expect(paragraphs({ ...filled, obituaryPronoun: 'he' })[2]).toContain('He received the Teacher of the Year award and was involved in');
    expect(paragraphs({ ...filled, obituaryPronoun: 'she' })[3]).toContain('She is preceded in death by her [RELATION]');
  });

  it('uses They with verbs that agree', () => {
    const [, , p3, p4] = paragraphs({ ...filled, obituaryPronoun: 'they' });
    expect(p3).toContain('They went to high school');
    expect(p3).toContain('They received the Teacher of the Year award and were involved in the parish choir.');
    expect(p4).toContain('They are preceded in death by their [RELATION]');
  });

  it('keeps [He/She] and [his/her] when no pronoun is set, and when the value is unknown', () => {
    for (const fields of [noPronoun, { ...noPronoun, obituaryPronoun: 'it' }]) {
      const [, , p3, p4] = paragraphs(fields);
      expect(p3).toContain('[He/She] went to high school');
      expect(p3).toContain('and was involved in');
      expect(p4).toContain('[He/She] is preceded in death by [his/her] [RELATION]');
    }
  });
});

describe('buildObituaryDraft: older values', () => {
  it('uses the name from The person when given, middle and surname are all empty', () => {
    const text = build({ personName: 'Anna Lee' });
    expect(text.startsWith('Anna Lee, [AGE], of')).toBe(true);
    expect(text).toContain('Anna Lee was born in');
    expect(text).toContain('Anna Lee is survived by');
  });

  it('uses the given name for [NAME] and the typed parts for the full name', () => {
    const [p1, , p3] = paragraphs({ ...filled, personName: 'Maggie Hayes' });
    expect(p1.startsWith('Margaret Ellen Hayes, 84')).toBe(true);
    expect(p3.startsWith('Margaret was born in')).toBe(true);
  });

  it('keeps [GIVEN NAME] or [SURNAME] when only one of them is typed', () => {
    expect(build({ obituarySurname: 'Hayes', personName: 'Anna Lee' }).startsWith('[GIVEN NAME] Hayes, ')).toBe(true);
  });

  it('writes the older career text when the job fields are empty', () => {
    const text = build({ obituaryCareer: 'a teacher for Boston Schools for 30 years.' });
    expect(text).toContain('[He/She] worked as a teacher for Boston Schools for 30 years.');
    expect(text).not.toContain('[JOB TITLE]');
  });

  it('prefers the job fields over the older career text', () => {
    const text = build({ obituaryCareer: 'a nurse', obituaryJobTitle: 'cook' });
    expect(text).toContain('worked as a cook for [COMPANY] for [NUMBER OF YEARS].');
    expect(text).not.toContain('a nurse');
  });

  it('writes the older survivors and note text', () => {
    const text = build({ personName: 'Anna Lee', obituarySurvivors: 'her husband, John of Boston.', obituaryNote: 'She will be missed.' });
    expect(text).toContain('Anna Lee is survived by her husband, John of Boston.');
    expect(text.endsWith('She will be missed.')).toBe(true);
  });
});

describe('job years', () => {
  it('reads a number as years, and a typed phrase as typed', () => {
    expect(build({ obituaryJobYears: '1' })).toContain('for 1 year.');
    expect(build({ obituaryJobYears: '12' })).toContain('for 12 years.');
    expect(build({ obituaryJobYears: 'over thirty years' })).toContain('for over thirty years.');
  });
});

describe('findTemplateBlanks and hasTemplateBlanks', () => {
  it('is true for the untouched template and finds every distinct bracket in it', () => {
    const empty = build({});
    expect(hasTemplateBlanks(empty, copy)).toBe(true);
    expect(new Set(findTemplateBlanks(empty, copy))).toEqual(new Set(empty.match(/\[[^\]]*\]/g)));
  });

  it('finds the new words', () => {
    expect(findTemplateBlanks('Died in [SERVICE LOCATION] with [CHURCH].', copy)).toEqual(['[SERVICE LOCATION]', '[CHURCH]']);
  });

  it('still finds every bracket word from the Step 1 template', () => {
    expect(copy.legacyBlanks.length).toBeGreaterThan(30);
    for (const word of copy.legacyBlanks) {
      expect(findTemplateBlanks(`Text ${word} text`, copy), word).toEqual([word]);
    }
  });

  it('finds an old edited text that still has a Step 1 word', () => {
    expect(hasTemplateBlanks('Anna died in [LOCATION OF DEATH].', copy)).toBe(true);
    expect(findTemplateBlanks('[He/She] liked tea. [He/She] sang.', copy)).toEqual(['[He/She]', '[He/She]']);
  });

  it('is false for a typed text', () => {
    expect(hasTemplateBlanks('Anna Lee died at home. She loved the garden.', copy)).toBe(false);
    expect(hasTemplateBlanks('', copy)).toBe(false);
    expect(hasTemplateBlanks(build(filled).replace(/\[[^\]]*\]/g, 'x'), copy)).toBe(false);
  });

  it("ignores the family's own brackets", () => {
    expect(hasTemplateBlanks('Anna Lee [my note] loved the garden. [1]', copy)).toBe(false);
    expect(findTemplateBlanks('Anna [my note] and [CITY]', copy)).toEqual(['[CITY]']);
  });
});
