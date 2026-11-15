/**
 * The web app's URL table: builders, a parser and `safeNext`. Pure functions, no router import,
 * so every later routing ticket shares one definition of "a path this app owns".
 *
 *   /                              landing
 *   /sign-in  (?next=)             sign in
 *   /sign-up                       goes to /sign-in
 *   /people                        Your people
 *   /people/:flowId                one person
 *   /people/:flowId/:section       person | announcement | service | obituary | thanks
 *   /people/:flowId/guide/:itemId  one checklist item
 *   /start, /start/:section, /start/guide/:itemId   the same, before a person exists
 *   /account, /join                account; join (the fragment is kept)
 */

export const SECTIONS = ['person', 'announcement', 'service', 'obituary', 'thanks'] as const;
export type Section = (typeof SECTIONS)[number];

export type Route =
  | { name: 'landing' }
  | { name: 'signIn'; next: string }
  | { name: 'signUp' }
  | { name: 'people' }
  | { name: 'person'; flowId: string }
  | { name: 'personSection'; flowId: string; section: Section }
  | { name: 'personGuide'; flowId: string; itemId: string }
  | { name: 'start' }
  | { name: 'startSection'; section: Section }
  | { name: 'startGuide'; itemId: string }
  | { name: 'account' }
  | { name: 'join' };

/** One path segment: letters, digits, dash, underscore. No "%" so encoded tricks never match. */
const ID = /^[A-Za-z0-9_-]{1,128}$/;

function isSection(value: string | undefined): value is Section {
  return (SECTIONS as readonly string[]).includes(value ?? '');
}

function isId(value: string | undefined): value is string {
  return value !== undefined && ID.test(value);
}

function matchPathname(pathname: string): Exclude<Route, { name: 'signIn' }> | { name: 'signIn' } | null {
  if (pathname === '/') {
    return { name: 'landing' };
  }
  if (!pathname.startsWith('/') || pathname.endsWith('/')) {
    return null;
  }
  const [first, a, b, c, ...extra] = pathname.slice(1).split('/');
  if (extra.length > 0) {
    return null;
  }
  const count = [first, a, b, c].filter((part) => part !== undefined).length;
  switch (first) {
    case 'sign-in':
      return count === 1 ? { name: 'signIn' } : null;
    case 'sign-up':
      return count === 1 ? { name: 'signUp' } : null;
    case 'account':
      return count === 1 ? { name: 'account' } : null;
    case 'join':
      return count === 1 ? { name: 'join' } : null;
    case 'people':
      if (count === 1) {
        return { name: 'people' };
      }
      if (!isId(a)) {
        return null;
      }
      if (count === 2) {
        return { name: 'person', flowId: a };
      }
      if (count === 3 && isSection(b)) {
        return { name: 'personSection', flowId: a, section: b };
      }
      if (count === 4 && b === 'guide' && isId(c)) {
        return { name: 'personGuide', flowId: a, itemId: c };
      }
      return null;
    case 'start':
      if (count === 1) {
        return { name: 'start' };
      }
      if (count === 2 && isSection(a)) {
        return { name: 'startSection', section: a };
      }
      if (count === 3 && a === 'guide' && isId(b)) {
        return { name: 'startGuide', itemId: b };
      }
      return null;
    default:
      return null;
  }
}

/** Split "/path?query#hash" into its parts. Only a leading "/" is accepted as a path. */
function split(raw: string): { pathname: string; query: string } {
  const noHash = raw.split('#')[0] ?? '';
  const [pathname = '', ...rest] = noHash.split('?');
  return { pathname, query: rest.join('?') };
}

/**
 * The route for a path (a query or fragment is allowed and ignored, except `?next=` on /sign-in),
 * or null when the path is not in the table (the router shows NotFound).
 */
export function parsePath(raw: string): Route | null {
  const { pathname, query } = split(raw);
  const matched = matchPathname(pathname);
  if (!matched) {
    return null;
  }
  if (matched.name === 'signIn') {
    return { name: 'signIn', next: safeNext(new URLSearchParams(query).get('next')) };
  }
  return matched;
}

/**
 * Where to go after sign-in. Returns the path only when it is exactly a path in the table (no
 * origin, no "//", no backslash, no query or fragment, no encoded characters); anything else is "/".
 */
export function safeNext(raw: string | null | undefined): string {
  if (typeof raw !== 'string' || raw === '' || raw.length > 512) {
    return '/';
  }
  if (!raw.startsWith('/') || raw.startsWith('//') || /[?#\\%\s\u0000-\u001f]/.test(raw)) {
    return '/';
  }
  const matched = matchPathname(raw);
  // Sign-in and sign-up are never a destination: sending someone there after sign-in would loop.
  if (!matched || matched.name === 'signIn' || matched.name === 'signUp') {
    return '/';
  }
  return raw;
}

/** Builders refuse an id the parser would not accept, so a built path always parses. */
function id(value: string): string {
  if (!isId(value)) {
    throw new Error(`Not a valid path id: ${JSON.stringify(value)}`);
  }
  return value;
}

export const paths = {
  landing: () => '/',
  /** With a `next` that is safe and not "/", adds `?next=`. */
  signIn: (next?: string) => {
    const target = safeNext(next);
    return target === '/' ? '/sign-in' : `/sign-in?next=${encodeURIComponent(target)}`;
  },
  signUp: () => '/sign-up',
  people: () => '/people',
  person: (flowId: string) => `/people/${id(flowId)}`,
  personSection: (flowId: string, section: Section) => `/people/${id(flowId)}/${section}`,
  personGuide: (flowId: string, itemId: string) => `/people/${id(flowId)}/guide/${id(itemId)}`,
  start: () => '/start',
  startSection: (section: Section) => `/start/${section}`,
  startGuide: (itemId: string) => `/start/guide/${id(itemId)}`,
  account: () => '/account',
  join: () => '/join',
} as const;
