import { screens } from './screens';
import type { ScreenName } from './screens';

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

/** Curly and HTML-escaped apostrophes become a straight one, so all spellings compare equal. */
function normalise(text: string): string {
  return text.replace(/[‘’]/g, "'").replace(/&apos;|&#39;|&#x27;|&rsquo;/g, "'");
}

/** A single lowercase word ('start', 'person') is more often a code value than copy. */
function looksLikeCode(text: string): boolean {
  return /^[a-z]+$/.test(text);
}

const ESCAPE = /[.*+?^${}()|[\]\\]/g;
// A placeholder in the copy matches `${anything}` in a template or `{anything}` in JSX.
const SOURCE_PLACEHOLDER = '(?:\\$\\{[^}]*\\}|\\{[^}]*\\})';

function patternFor(text: string): RegExp {
  const body = text
    .split(/(\{\w+\})/)
    .map((part) => (/^\{\w+\}$/.test(part) ? SOURCE_PLACEHOLDER : part.replace(ESCAPE, '\\$&')))
    .join('');
  // The whole text as a string literal ('x', "x", `x`), or as the only text of a JSX element (>x<).
  return new RegExp(`(?:['"\`]${body}['"\`])|(?:>\\s*${body}\\s*<)`);
}

/**
 * The copy strings of `screen` that a source file hard-codes instead of reading from libs/copy.
 * Used by each app's guard spec for the screens it has migrated. A guard, not a parser: it sees
 * whole strings in quotes and whole JSX text, not copy built from pieces.
 */
export function findHardCodedCopy(source: string, screen: ScreenName): string[] {
  const text = normalise(source);
  return allStrings(screens[screen]).filter(
    (copy) => copy.length >= 3 && !looksLikeCode(copy) && patternFor(normalise(copy)).test(text),
  );
}
