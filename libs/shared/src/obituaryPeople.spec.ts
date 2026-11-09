import {
  ageFrom,
  OBITUARY_PEOPLE_MAX_ROWS,
  parsePeople,
  PRECEDED_RELATIONS,
  serializePeople,
  SURVIVOR_RELATIONS,
  splitPersonName,
  type ObituaryPerson,
} from './index.js';

const row = (name: string, city = '', relation = 'child'): ObituaryPerson => ({
  name,
  city,
  relation: relation as ObituaryPerson['relation'],
});

describe('serializePeople / parsePeople', () => {
  it('round trips the survivor list', () => {
    const rows = [row('Ann Lee', 'Tulsa', 'spouse'), row('Bo Lee', '', 'great-grandchild')];
    expect(parsePeople(serializePeople(rows), SURVIVOR_RELATIONS)).toEqual(rows);
  });

  it('round trips the preceded list', () => {
    const rows = [row('Cy Lee', 'Ada', 'parent')];
    expect(parsePeople(serializePeople(rows), PRECEDED_RELATIONS)).toEqual(rows);
  });

  it('drops rows with empty name and city, and returns "" when none are left', () => {
    expect(serializePeople([row(''), row('  ', ' ')])).toBe('');
    expect(parsePeople(serializePeople([row(''), row('Ann')]), SURVIVOR_RELATIONS)).toEqual([row('Ann')]);
  });

  it('caps at 40 rows', () => {
    const many = Array.from({ length: 50 }, (_, i) => row(`P${i}`));
    expect(parsePeople(serializePeople(many), SURVIVOR_RELATIONS)).toHaveLength(OBITUARY_PEOPLE_MAX_ROWS);
  });

  it('parses "" as an empty list', () => {
    expect(parsePeople('', SURVIVOR_RELATIONS)).toEqual([]);
  });

  const good = { name: 'A', city: 'B', relation: 'child' };
  it.each([
    ['bad JSON', '{nope'],
    ['non-array', JSON.stringify(good)],
    ['41 rows', JSON.stringify(Array.from({ length: 41 }, () => good))],
    ['row not an object', JSON.stringify([null])],
    ['row is an array', JSON.stringify([['A', 'B', 'child']])],
    ['row is a string', JSON.stringify(['A'])],
    ['extra key', JSON.stringify([{ ...good, age: 'x' }])],
    ['missing key', JSON.stringify([{ name: 'A', relation: 'child' }])],
    ['unknown key', JSON.stringify([{ name: 'A', city: 'B', rel: 'child' }])],
    ['non-string value', JSON.stringify([{ ...good, city: 5 }])],
    ['relation outside list', JSON.stringify([{ ...good, relation: 'cousin' }])],
    ['__proto__ key', '[{"name":"A","city":"B","__proto__":"child"}]'],
  ])('refuses %s', (_label, text) => {
    expect(parsePeople(text, SURVIVOR_RELATIONS)).toBeNull();
  });

  it('refuses a relation that is valid only in the other list', () => {
    const text = JSON.stringify([{ ...good, relation: 'grandchild' }]);
    expect(parsePeople(text, PRECEDED_RELATIONS)).toBeNull();
  });
});

describe('splitPersonName', () => {
  it('handles 1, 2 and 4 words and extra spaces', () => {
    expect(splitPersonName('Madonna')).toEqual({ given: 'Madonna', middle: '', surname: '' });
    expect(splitPersonName('Ann Lee')).toEqual({ given: 'Ann', middle: '', surname: 'Lee' });
    expect(splitPersonName('  Ann   Mae  Sue \t Lee ')).toEqual({
      given: 'Ann',
      middle: 'Mae Sue',
      surname: 'Lee',
    });
    expect(splitPersonName('   ')).toEqual({ given: '', middle: '', surname: '' });
  });
});

describe('ageFrom', () => {
  it('counts whole years', () => {
    expect(ageFrom('1940-06-15', '2026-06-14')).toBe('85');
    expect(ageFrom('1940-06-15', '2026-06-16')).toBe('86');
    expect(ageFrom('June 15, 1940', 'November 2, 2026')).toBe('86');
  });

  it('counts a birthday on the day of death', () => {
    expect(ageFrom('1940-06-15', '2026-06-15')).toBe('86');
    expect(ageFrom('1940-06-15', '1940-06-15')).toBe('0');
  });

  it('returns "" when death is before birth', () => {
    expect(ageFrom('2000-01-02', '2000-01-01')).toBe('');
    expect(ageFrom('2001-01-01', '2000-12-31')).toBe('');
  });

  it('returns "" when a text is unreadable', () => {
    expect(ageFrom('', '2026-06-15')).toBe('');
    expect(ageFrom('1940-06-15', 'soon')).toBe('');
  });
});
