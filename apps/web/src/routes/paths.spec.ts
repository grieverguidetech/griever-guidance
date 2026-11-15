import { SECTIONS, parsePath, paths, safeNext } from './paths';
import type { Route } from './paths';

const cases: Array<[string, Route, string]> = [
  ['landing', { name: 'landing' }, paths.landing()],
  ['signIn', { name: 'signIn', next: '/' }, paths.signIn()],
  ['signUp', { name: 'signUp' }, paths.signUp()],
  ['people', { name: 'people' }, paths.people()],
  ['person', { name: 'person', flowId: 'abc-123_X' }, paths.person('abc-123_X')],
  ['start', { name: 'start' }, paths.start()],
  ['account', { name: 'account' }, paths.account()],
  ['join', { name: 'join' }, paths.join()],
];

describe('paths round trip', () => {
  it.each(cases)('%s', (_name, route, path) => {
    expect(parsePath(path)).toEqual(route);
  });

  it.each(SECTIONS)('person and start section %s', (section) => {
    expect(parsePath(paths.personSection('f1', section))).toEqual({ name: 'personSection', flowId: 'f1', section });
    expect(parsePath(paths.startSection(section))).toEqual({ name: 'startSection', section });
  });

  it('guide items', () => {
    expect(parsePath(paths.personGuide('f1', 'i9'))).toEqual({ name: 'personGuide', flowId: 'f1', itemId: 'i9' });
    expect(parsePath(paths.startGuide('i9'))).toEqual({ name: 'startGuide', itemId: 'i9' });
  });

  it('sign-in keeps a safe next and builds it back', () => {
    const built = paths.signIn('/people/f1/service');
    expect(built).toBe('/sign-in?next=%2Fpeople%2Ff1%2Fservice');
    expect(parsePath(built)).toEqual({ name: 'signIn', next: '/people/f1/service' });
  });

  it('ignores a query or fragment on other routes', () => {
    expect(parsePath('/join#abc')).toEqual({ name: 'join' });
    expect(parsePath('/people?x=1')).toEqual({ name: 'people' });
  });
});

describe('parsePath rejects paths outside the table', () => {
  it.each([
    '',
    'people',
    '/nope',
    '/people/',
    '/people/f1/unknown',
    '/people/f1/guide',
    '/people/f1/guide/i/extra',
    '/people/f1/person/extra',
    '/people/a b',
    '/people/%2e%2e',
    '/start/unknown',
    '/start/guide',
    '/sign-in/extra',
    '/account/x',
  ])('%j', (path) => {
    expect(parsePath(path)).toBeNull();
  });
});

describe('safeNext', () => {
  it.each(['/people', '/people/f1', '/people/f1/obituary', '/people/f1/guide/i1', '/start/guide/i1', '/account', '/join'])(
    'keeps %s',
    (path) => {
      expect(safeNext(path)).toBe(path);
    },
  );

  it.each([
    null,
    undefined,
    '',
    'https://evil.com',
    'http://evil.com/people',
    '//evil.com',
    '///evil.com',
    '/\\evil.com',
    '\\\\evil.com',
    'javascript:alert(1)',
    'people',
    '/unknown',
    '/people/f1/unknown',
    '/people/f1?x=1',
    '/people#frag',
    '/sign-in',
    '/sign-up',
    '/%2F%2Fevil.com',
    '%2F%2Fevil.com',
    '/people/%2e%2e/account',
    '/people/f1%2Fservice',
    '/people/f1\n',
    '/ people',
    `/people/${'a'.repeat(600)}`,
  ])('returns "/" for %j', (raw) => {
    expect(safeNext(raw)).toBe('/');
  });
});

describe('builders refuse bad ids', () => {
  it.each(['', 'a/b', '../x', 'a b', 'a%2Fb', 'a?b', 'a'.repeat(129)])('%j', (bad) => {
    expect(() => paths.person(bad)).toThrow();
    expect(() => paths.personSection(bad, 'person')).toThrow();
    expect(() => paths.personGuide('f1', bad)).toThrow();
    expect(() => paths.personGuide(bad, 'i1')).toThrow();
    expect(() => paths.startGuide(bad)).toThrow();
  });
});
