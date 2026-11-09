import type { ScreenCopy } from './index';

type DraftCopy = ScreenCopy<'obituaryDraft'>;

export type ObituaryPronoun = 'he' | 'she' | 'they';

/** What the obituary template reads. Names match the person's fields; dates and times are display text. */
export interface ObituaryDraftFields {
  personName?: string;
  obituaryGivenName?: string;
  obituaryMiddleName?: string;
  obituarySurname?: string;
  obituaryAge?: string;
  obituaryCity?: string;
  obituaryState?: string;
  obituaryDeathPlace?: string;
  obituaryFuneralHome?: string;
  obituaryChurch?: string;
  obituaryCemeteryLocation?: string;
  obituaryBirthPlace?: string;
  obituaryMotherName?: string;
  obituaryFatherName?: string;
  obituaryHighSchool?: string;
  obituaryGradYear?: string;
  obituaryDegree?: string;
  obituaryCollege?: string;
  obituaryJobTitle?: string;
  obituaryCompany?: string;
  obituaryJobYears?: string;
  obituaryHobbies?: string;
  obituaryAwards?: string;
  obituaryOrganizations?: string;
  obituaryPronoun?: string;
  dateOfPassing?: string;
  birthDate?: string;
  servicePlace?: string;
  serviceDate?: string;
  serviceTime?: string;
  serviceOfficiant?: string;
  burialPlace?: string;
  burialPrivate?: boolean;
  visitationPlace?: string;
  visitationDate?: string;
  visitationTime?: string;
  /** Older fields. They still fill the draft when the newer ones are empty. */
  obituaryCareer?: string;
  obituarySurvivors?: string;
  obituaryNote?: string;
}

/** Replace every `{name}`. A missing value throws, so a typo in the copy shows up in tests. */
function fillSlots(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_whole, key: string) => {
    const value = values[key];
    if (value === undefined) {
      throw new Error(`Missing value for {${key}} in "${template}"`);
    }
    return value;
  });
}

/** Trim, and drop one trailing full stop, for a value that sits before a full stop the template adds. */
function cleanEnd(value: string | undefined): string {
  return (value ?? '').trim().replace(/\.$/, '').trim();
}

/** Sounds that start with a vowel letter but read "a" ("a university"), and with a silent h but read "an". */
const VOWEL_LETTER_SAYS_A = /^(uni|use|usu|eu|one)/i;
const SILENT_H_SAYS_AN = /^(hour|honest|honou?r|heir)/i;

/**
 * The value with "a" or "an" in front, for a typed job title or degree. Nothing is added when the
 * family already typed an article ("a nurse", "the dean"; a capital first letter is lower-cased), or when the first word is in capitals
 * ("MBA"), because we cannot tell how a set of letters is said.
 */
function withArticle(value: string): string {
  const typed = /^(a|an|the)(\s.*)$/is.exec(value);
  if (typed) {
    return typed[1].toLowerCase() + typed[2];
  }
  const firstWord = value.split(/\s+/)[0];
  if (firstWord.length > 1 && firstWord === firstWord.toUpperCase() && /[A-Z]/.test(firstWord)) {
    return value;
  }
  const an = SILENT_H_SAYS_AN.test(value) || (/^[aeiou]/i.test(value) && !VOWEL_LETTER_SAYS_A.test(value));
  return `${an ? 'an' : 'a'} ${value}`;
}

const MONTHS = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
];

/** Month number (0 to 11) of a typed name: the full name, its exact 3-letter form, or "sept". Else -1. */
function monthIndex(name: string): number {
  const lower = name.toLowerCase();
  if (lower === 'sept') {
    return 8;
  }
  return MONTHS.findIndex((month) => month === lower || (lower.length === 3 && month.startsWith(lower)));
}

/** Year, month (0 to 11) and day of a complete typed date: 2026-05-29, 5/29/2026 or May 29, 2026. Else null. */
function completeDate(text: string): { y: number; m: number; d: number } | null {
  const value = text.trim();
  let y: number;
  let m: number;
  let d: number;
  let match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (match) {
    [y, m, d] = [Number(match[1]), Number(match[2]) - 1, Number(match[3])];
  } else if ((match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value))) {
    [m, d, y] = [Number(match[1]) - 1, Number(match[2]), Number(match[3])];
  } else if ((match = /^([A-Za-z]+)\.?\s+(\d{1,2}),?\s+(\d{4})$/.exec(value))) {
    [m, d, y] = [monthIndex(match[1]), Number(match[2]), Number(match[3])];
  } else {
    return null;
  }
  const date = new Date(y, m, d);
  const real = m >= 0 && date.getFullYear() === y && date.getMonth() === m && date.getDate() === d;
  return real && y >= 1800 && y <= 2100 ? { y, m, d } : null;
}

/**
 * Whole years between two typed dates, as text. '' when either is unreadable or death comes first.
 * Reads dates the way `parseCompleteDate` and `ageFrom` in libs/shared do (years 1800 to 2100). This lib
 * cannot import shared, because shared depends on it; libs/shared/src/obituaryAgeParity.spec.ts keeps the two equal.
 */
function ageBetween(birthText: string | undefined, deathText: string | undefined): string {
  const birth = completeDate(birthText ?? '');
  const death = completeDate(deathText ?? '');
  if (!birth || !death) {
    return '';
  }
  const hadBirthday = death.m > birth.m || (death.m === birth.m && death.d >= birth.d);
  const years = death.y - birth.y - (hadBirthday ? 0 : 1);
  return years >= 0 ? String(years) : '';
}

function pronounOf(value: string | undefined): ObituaryPronoun | 'unset' {
  return value === 'he' || value === 'she' || value === 'they' ? value : 'unset';
}

/** "30" reads "30 years" ("1" reads "1 year"). Text that has no "year" word gets " years"; "thirty years" is kept. */
function yearsPhrase(value: string, blank: string): string {
  if (value === '') {
    return blank;
  }
  if (/^\d+$/.test(value)) {
    return `${value} ${Number(value) === 1 ? 'year' : 'years'}`;
  }
  return /\byears?\b/i.test(value) ? value : `${value} years`;
}

/**
 * Fill the obituary template (five paragraphs, separated by a blank line).
 *
 * Core parts (names, age, city, state, dates, service, burial, visitation, birth, parents, school, job)
 * keep their own [BRACKET] when empty, so the family sees what is missing. Optional parts (middle name,
 * place of death, funeral home, degree and college, hobbies, awards, organizations) drop out when empty.
 * A value in the middle of a sentence is trimmed only ("2:00 p.m." keeps its stop). A value the template
 * follows with a full stop loses one typed full stop, so there is no "..". The final note is trimmed only.
 */
export function buildObituaryDraft(fields: ObituaryDraftFields, copy: DraftCopy): string {
  const { blanks } = copy;
  const mid = (value: string | undefined, blank: string): string => value?.trim() || blank;
  const last = (value: string | undefined, blank: string): string => cleanEnd(value) || blank;
  const pronoun = copy.pronouns[pronounOf(fields.obituaryPronoun)];

  const given = fields.obituaryGivenName?.trim() ?? '';
  const middle = fields.obituaryMiddleName?.trim() ?? '';
  const surname = fields.obituarySurname?.trim() ?? '';
  const personName = fields.personName?.trim() ?? '';
  const fullName =
    given === '' && middle === '' && surname === '' && personName !== ''
      ? personName
      : [given || blanks.givenName, middle, surname || blanks.surname].filter(Boolean).join(' ');
  const name = given || personName || blanks.name;

  const church = cleanEnd(fields.obituaryChurch);
  const deathPlace = cleanEnd(fields.obituaryDeathPlace);
  const funeralHome = cleanEnd(fields.obituaryFuneralHome);
  const burial = fields.burialPrivate
    ? copy.burialPrivate
    : fillSlots(copy.burialSentence, {
        burialPlace: mid(fields.burialPlace, blanks.burialPlace),
        cemeteryLocation: last(fields.obituaryCemeteryLocation, blanks.cemeteryLocation),
      });

  const degree = cleanEnd(fields.obituaryDegree);
  const college = cleanEnd(fields.obituaryCollege);
  const degreePhrase = degree === '' ? `a ${blanks.degree}` : withArticle(degree);
  const collegeSentence =
    degree === '' && college === ''
      ? ''
      : fillSlots(copy.collegeSentence, { ...pronoun, degree: degreePhrase, college: college || blanks.college });

  const jobTitle = cleanEnd(fields.obituaryJobTitle);
  const company = cleanEnd(fields.obituaryCompany);
  const jobYears = cleanEnd(fields.obituaryJobYears);
  const oldCareer = cleanEnd(fields.obituaryCareer);
  let jobSentence: string;
  if (jobTitle === '' && company === '' && jobYears === '' && oldCareer !== '') {
    jobSentence = fillSlots(copy.jobFallbackSentence, { ...pronoun, career: oldCareer });
  } else {
    jobSentence = fillSlots(copy.jobSentence, {
      ...pronoun,
      jobTitle: jobTitle === '' ? `a ${blanks.jobTitle}` : withArticle(jobTitle),
      company: company || blanks.company,
      jobYears: yearsPhrase(jobYears, blanks.jobYears),
    });
  }

  const hobbies = cleanEnd(fields.obituaryHobbies);
  const awards = cleanEnd(fields.obituaryAwards);
  const organizations = cleanEnd(fields.obituaryOrganizations);
  let awardsSentence = '';
  if (awards !== '' && organizations !== '') {
    awardsSentence = fillSlots(copy.awardsAndInvolvedSentence, { ...pronoun, awards, organizations });
  } else if (awards !== '') {
    awardsSentence = fillSlots(copy.awardsSentence, { ...pronoun, awards });
  } else if (organizations !== '') {
    awardsSentence = fillSlots(copy.involvedSentence, { ...pronoun, organizations });
  }

  const survivors = cleanEnd(fields.obituarySurvivors);

  const values: Record<string, string> = {
    ...pronoun,
    fullName,
    name,
    age: fields.obituaryAge?.trim() || ageBetween(fields.birthDate, fields.dateOfPassing) || blanks.age,
    city: last(fields.obituaryCity, blanks.city),
    state: last(fields.obituaryState, blanks.state),
    dateOfPassing: mid(fields.dateOfPassing, blanks.dateOfPassing),
    deathClause: deathPlace === '' ? '' : fillSlots(copy.deathClause, { deathPlace }),
    servicePlace: mid(fields.servicePlace, blanks.servicePlace),
    serviceDate: mid(fields.serviceDate, blanks.serviceDate),
    serviceTime: mid(fields.serviceTime, blanks.serviceTime),
    officiant: mid(fields.serviceOfficiant, blanks.officiant),
    churchClause: church === '' ? '' : fillSlots(copy.churchClause, { church }),
    burial,
    visitationPlace: mid(fields.visitationPlace, blanks.visitationPlace),
    visitationDate: mid(fields.visitationDate, blanks.visitationDate),
    visitationTime: last(fields.visitationTime, blanks.visitationTime),
    funeralHomeSentence: funeralHome === '' ? '' : fillSlots(copy.funeralHomeSentence, { funeralHome }),
    birthPlace: mid(fields.obituaryBirthPlace, blanks.birthPlace),
    mother: mid(fields.obituaryMotherName, blanks.mother),
    father: mid(fields.obituaryFatherName, blanks.father),
    birthDate: last(fields.birthDate, blanks.birthDate),
    highSchool: mid(fields.obituaryHighSchool, blanks.highSchool),
    gradYear: last(fields.obituaryGradYear, blanks.gradYear),
    collegeSentence,
    jobSentence,
    hobbiesSentence: hobbies === '' ? '' : fillSlots(copy.hobbiesSentence, { ...pronoun, hobbies }),
    awardsSentence,
    survivors: survivors || blanks.survivors,
    note: fields.obituaryNote?.trim() || blanks.note,
  };

  return [copy.paragraph1, copy.paragraph2, copy.paragraph3, copy.paragraph4, copy.paragraph5]
    .map((paragraph) => fillSlots(paragraph, values))
    .join('\n\n');
}

const BRACKET_WORD = /\[[^\]]*\]/g;

/** Every [BRACKET] word the template can leave in a text: the current copy and the Step 1 words. */
const bracketWordCache = new WeakMap<object, Set<string>>();

function templateBracketWords(copy: DraftCopy): Set<string> {
  const cached = bracketWordCache.get(copy);
  if (cached) {
    return cached;
  }
  const { pronouns, blanks, legacyBlanks, ...sentences } = copy;
  const sources = [
    ...Object.values(sentences),
    ...Object.values(blanks),
    ...Object.values(pronouns).flatMap((forms) => Object.values(forms)),
  ];
  const words = new Set([...sources.flatMap((source) => source.match(BRACKET_WORD) ?? []), ...legacyBlanks]);
  bracketWordCache.set(copy, words);
  return words;
}

/** The template's [BRACKET] words still in the text, in order. A family's own brackets, such as [my note], do not count. */
export function findTemplateBlanks(text: string, copy: DraftCopy): string[] {
  const words = templateBracketWords(copy);
  return (text.match(BRACKET_WORD) ?? []).filter((word) => words.has(word));
}

/** True while any of the template's [BRACKET] words is still in the text. */
export function hasTemplateBlanks(text: string, copy: DraftCopy): boolean {
  return findTemplateBlanks(text, copy).length > 0;
}
