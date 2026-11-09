import { buildObituaryDraft, screenCopy } from '../../copy/src/index.js';
import { PRECEDED_RELATIONS, SURVIVOR_RELATIONS, parsePeople } from './obituaryPeople.js';

// The obituary builder (libs/copy) reads the two people lists itself, because copy cannot import shared.
// This keeps it equal to parsePeople: a list that parses gives the same rows, any other list gives none.
// Names are Pn (unique per row), so a row the builder drops or invents shows in paragraph 4.
const row = (relation: string, n: number, city = 'Boston'): object => ({ name: `P${n}`, city, relation });
const many = (count: number, relation = 'child'): object[] => Array.from({ length: count }, (_, i) => row(relation, i + 1));

const TEXTS: string[] = [
  '',
  '  ',
  '[]',
  JSON.stringify([row('spouse', 1)]),
  JSON.stringify([row('child', 1), row('child', 2, '')]),
  JSON.stringify([row('spouse', 1), row('child', 2), row('sibling', 3), row('parent', 4)]),
  JSON.stringify([row('grandchild', 1)]),
  JSON.stringify([row('great-grandchild', 1)]),
  JSON.stringify([row('2nd great-grandchild', 1)]),
  JSON.stringify([row('sibling', 1)]),
  JSON.stringify([row('parent', 1)]),
  JSON.stringify([row('uncle', 1)]),
  JSON.stringify([row('spouse', 1), row('uncle', 2)]),
  JSON.stringify([row('spouse', 1), row('grandchild', 2)]),
  JSON.stringify([{ name: 'P1', city: 'Boston' }]),
  JSON.stringify([{ ...row('spouse', 1), extra: 'x' }]),
  JSON.stringify([{ name: 1, city: 'Boston', relation: 'spouse' }]),
  JSON.stringify([null]),
  JSON.stringify([[]]),
  JSON.stringify({ name: 'P1' }),
  JSON.stringify(many(40)),
  JSON.stringify(many(41)),
  'not json',
];

describe('the obituary builder reads people lists as parsePeople does', () => {
  const copy = screenCopy('obituaryDraft');
  const fields = { obituaryGivenName: 'A', obituarySurname: 'B', obituaryPronoun: 'he' };
  const paragraph4 = (extra: object): string => buildObituaryDraft({ ...fields, ...extra }, copy).split('\n\n')[3];
  const namesIn = (text: string): string[] => text.match(/\bP\d+\b/g) ?? [];

  it.each(TEXTS)('survivors %j', (text) => {
    const rows = parsePeople(text, SURVIVOR_RELATIONS) ?? [];
    const p4 = paragraph4({ obituarySurvivorList: text });
    if (rows.length === 0) {
      expect(p4).toBe('A is survived by his [RELATION], [SURVIVOR NAME] of [SURVIVOR CITY].');
      return;
    }
    expect(namesIn(p4)).toHaveLength(rows.length);
    for (const person of rows) {
      expect(p4, person.name).toContain(person.name);
    }
  });

  it.each(TEXTS)('preceded %j', (text) => {
    const rows = parsePeople(text, PRECEDED_RELATIONS) ?? [];
    const p4 = paragraph4({ obituaryPrecededList: text });
    if (rows.length === 0) {
      expect(p4).toBe('A is survived by his [RELATION], [SURVIVOR NAME] of [SURVIVOR CITY].');
      return;
    }
    expect(p4).toContain('preceded in death by');
    expect(namesIn(p4)).toHaveLength(rows.length);
    for (const person of rows) {
      expect(p4, person.name).toContain(person.name);
    }
  });
});
