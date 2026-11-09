import { parseCompleteDate } from './dates.js';

export const SURVIVOR_RELATIONS = [
  'spouse',
  'child',
  'grandchild',
  'great-grandchild',
  '2nd great-grandchild',
  'sibling',
  'parent',
] as const;

export const PRECEDED_RELATIONS = ['spouse', 'child', 'sibling', 'parent'] as const;

export type SurvivorRelation = (typeof SURVIVOR_RELATIONS)[number];
export type PrecededRelation = (typeof PRECEDED_RELATIONS)[number];

export interface ObituaryPerson<R extends string = SurvivorRelation | PrecededRelation> {
  name: string;
  city: string;
  relation: R;
}

export const OBITUARY_PEOPLE_MAX_ROWS = 40;

/** One list as one text key: JSON, or '' when there are no rows. */
export function serializePeople(rows: readonly ObituaryPerson[]): string {
  const kept = rows
    .filter((row) => row.name.trim() !== '' || row.city.trim() !== '')
    .slice(0, OBITUARY_PEOPLE_MAX_ROWS)
    .map(({ name, city, relation }) => ({ name, city, relation }));
  return kept.length === 0 ? '' : JSON.stringify(kept);
}

const ROW_KEYS = ['name', 'city', 'relation'];

function parseRow<R extends string>(value: unknown, relations: readonly R[]): ObituaryPerson<R> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }
  const keys = Object.keys(value);
  if (keys.length !== ROW_KEYS.length || !ROW_KEYS.every((key) => keys.includes(key))) {
    return null;
  }
  const { name, city, relation } = value as Record<string, unknown>;
  if (typeof name !== 'string' || typeof city !== 'string' || typeof relation !== 'string') {
    return null;
  }
  if (!(relations as readonly string[]).includes(relation)) {
    return null;
  }
  return { name, city, relation: relation as R };
}

/** Rows, or null when the text is not a valid list. '' is an empty list. */
export function parsePeople<R extends string>(
  text: string,
  relations: readonly R[],
): ObituaryPerson<R>[] | null {
  if (text === '') {
    return [];
  }
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  if (!Array.isArray(data) || data.length > OBITUARY_PEOPLE_MAX_ROWS) {
    return null;
  }
  const rows: ObituaryPerson<R>[] = [];
  for (const item of data) {
    const row = parseRow(item, relations);
    if (!row) {
      return null;
    }
    rows.push(row);
  }
  return rows;
}

export function splitPersonName(full: string): { given: string; middle: string; surname: string } {
  const words = full.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return { given: '', middle: '', surname: '' };
  }
  if (words.length === 1) {
    return { given: words[0], middle: '', surname: '' };
  }
  return {
    given: words[0],
    middle: words.slice(1, -1).join(' '),
    surname: words[words.length - 1],
  };
}

/** Calendar parts of a complete typed date. Partial text gives null, so an age is never invented. */
function calendarParts(text: string): { y: number; m: number; d: number } | null {
  const date = parseCompleteDate(text, { minYear: 1800, maxYear: 2100 });
  if (!date) {
    return null;
  }
  return { y: date.getFullYear(), m: date.getMonth(), d: date.getDate() };
}

/** Whole years between two typed dates, as a string. '' when either is unreadable or death is first. */
export function ageFrom(birthText: string, deathText: string): string {
  const birth = calendarParts(birthText);
  const death = calendarParts(deathText);
  if (!birth || !death) {
    return '';
  }
  const before =
    death.y < birth.y ||
    (death.y === birth.y && (death.m < birth.m || (death.m === birth.m && death.d < birth.d)));
  if (before) {
    return '';
  }
  const hadBirthday = death.m > birth.m || (death.m === birth.m && death.d >= birth.d);
  return String(death.y - birth.y - (hadBirthday ? 0 : 1));
}
