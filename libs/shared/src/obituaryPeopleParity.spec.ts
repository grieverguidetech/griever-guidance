import { buildObituaryDraft, screenCopy } from '../../copy/src/index.js';
import { PRECEDED_RELATIONS, SURVIVOR_RELATIONS, parsePeople } from './obituaryPeople.js';

// The obituary builder (libs/copy) reads the two people lists itself, because copy cannot import shared.
// This keeps it equal to parsePeople: a list that parses gives rows, any other list gives none.
const row = (relation: string, name = 'Ann', city = 'Boston'): object => ({ name, city, relation });

const TEXTS: string[] = [
  '',
  '[]',
  JSON.stringify([row('spouse')]),
  JSON.stringify([row('child'), row('child', 'Bo', '')]),
  JSON.stringify([row('grandchild')]),
  JSON.stringify([row('great-grandchild')]),
  JSON.stringify([row('2nd great-grandchild')]),
  JSON.stringify([row('sibling')]),
  JSON.stringify([row('parent')]),
  JSON.stringify([row('uncle')]),
  JSON.stringify([row('spouse'), row('uncle')]),
  JSON.stringify([{ name: 'Ann', city: 'Boston' }]),
  JSON.stringify([{ ...row('spouse'), extra: 'x' }]),
  JSON.stringify([{ name: 1, city: 'Boston', relation: 'spouse' }]),
  JSON.stringify([null]),
  JSON.stringify([[]]),
  JSON.stringify({ name: 'Ann' }),
  JSON.stringify(Array.from({ length: 40 }, () => row('child'))),
  JSON.stringify(Array.from({ length: 41 }, () => row('child'))),
  'not json',
];

describe('the obituary builder reads people lists as parsePeople does', () => {
  const copy = screenCopy('obituaryDraft');
  const fields = { obituaryGivenName: 'A', obituarySurname: 'B', obituaryPronoun: 'he' };

  it.each(TEXTS)('survivors %j', (text) => {
    const rows = parsePeople(text, SURVIVOR_RELATIONS) ?? [];
    const p4 = buildObituaryDraft({ ...fields, obituarySurvivorList: text }, copy).split('\n\n')[3];
    expect(p4.includes('[RELATION]'), p4).toBe(rows.length === 0);
  });

  it.each(TEXTS)('preceded %j', (text) => {
    const rows = parsePeople(text, PRECEDED_RELATIONS) ?? [];
    const p4 = buildObituaryDraft({ ...fields, obituaryPrecededList: text }, copy).split('\n\n')[3];
    expect(p4.includes('preceded in death'), p4).toBe(rows.length > 0);
  });
});
