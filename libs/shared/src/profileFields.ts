import { CONTROL_CHARS } from './flowFacts.js';

/** Longest full name, in characters. */
export const FULL_NAME_MAX_LENGTH = 120;
/** Earliest birth year accepted. */
export const BIRTH_YEAR_MIN = 1900;

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

// Line breaks and tabs are not allowed in a name, on top of the hidden characters CONTROL_CHARS refuses.
const LINE_OR_TAB = /[\n\r\t]/;

/**
 * Cleans a full name: trims it, and turns blank or whitespace-only into null.
 * Anything that is not a string comes back unchanged so the validator can refuse it.
 */
export function normalizeFullName(value: unknown): unknown {
  if (typeof value !== 'string') {
    return value;
  }
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

/** True when the value is text of 120 characters or fewer with no line breaks, tabs or hidden characters. */
export function isValidFullName(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    [...value].length <= FULL_NAME_MAX_LENGTH &&
    !CONTROL_CHARS.test(value) &&
    !LINE_OR_TAB.test(value)
  );
}

/**
 * True for a real calendar date written yyyy-mm-dd, in year 1900 or later and not after today.
 * `today` is a yyyy-mm-dd string (UTC); it is a parameter so tests do not depend on the clock.
 */
export function isValidBirthDate(value: unknown, today: string = new Date().toISOString().slice(0, 10)): value is string {
  if (typeof value !== 'string') {
    return false;
  }
  const match = ISO_DATE.exec(value);
  if (!match) {
    return false;
  }
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  if (year < BIRTH_YEAR_MIN) {
    return false;
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  const real = date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  // Same-format strings compare correctly as text.
  return real && value <= today;
}
