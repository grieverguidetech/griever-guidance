import { CONTROL_CHARS } from './flowFacts.js';

/** Longest full name, in characters. */
export const FULL_NAME_MAX_LENGTH = 120;
/** Longest first name, last name or address line, in characters. */
export const NAME_PART_MAX_LENGTH = 100;
/** Longest city, in characters. */
export const CITY_MAX_LENGTH = 60;
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

/** True when the value is one line of text of `max` characters or fewer, with no tabs or hidden characters. */
function isOneLine(value: unknown, max: number): value is string {
  return typeof value === 'string' && [...value].length <= max && !CONTROL_CHARS.test(value) && !LINE_OR_TAB.test(value);
}

/** Cleans a first or last name the way a full name is cleaned: trimmed, blank becomes null. */
export const normalizeNamePart = normalizeFullName;

/** True when the value is a first or last name: up to 100 characters, one line, no hidden characters. */
export function isValidNamePart(value: unknown): value is string {
  return isOneLine(value, NAME_PART_MAX_LENGTH);
}

/**
 * Splits a name saved as one string into first and last name: the last word is the last name.
 * Used on read for profiles saved before first and last name existed.
 */
export function splitFullName(fullName: string | null | undefined): { firstName: string | null; lastName: string | null } {
  const words = (fullName ?? '').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return { firstName: null, lastName: null };
  }
  if (words.length === 1) {
    return { firstName: words[0] ?? null, lastName: null };
  }
  return { firstName: words.slice(0, -1).join(' '), lastName: words[words.length - 1] ?? null };
}

/** A US-shaped mailing address. `line2` is an empty string when there is none. */
export interface Address {
  line1: string;
  line2: string;
  city: string;
  /** Two capital letters. */
  state: string;
  /** 12345 or 12345-6789. */
  zip: string;
}

export type AddressField = keyof Address;
export type AddressProblem = 'required' | 'tooLong' | 'badChars' | 'badState' | 'badZip' | 'invalid';
/** `address` is the whole value (wrong shape); the other keys are single fields. */
export type AddressErrorKey = AddressField | 'address';
export type AddressCheck = { ok: true; address: Address | null } | { ok: false; errors: Partial<Record<AddressErrorKey, AddressProblem>> };

const ADDRESS_FIELDS: readonly AddressField[] = ['line1', 'line2', 'city', 'state', 'zip'];
const STATE = /^[A-Z]{2}$/;
const ZIP = /^\d{5}(-\d{4})?$/;

/**
 * Cleans and checks an address. Fields are trimmed and the state is upper-cased. An address with every field blank is
 * "no address" (`address: null`). Otherwise line 1, city, state and ZIP are required; line 2 is optional.
 * On failure, `errors` names each field that is wrong, so a form can say which one.
 */
export function checkAddress(input: unknown): AddressCheck {
  if (input === null || input === undefined) {
    return { ok: true, address: null };
  }
  if (typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, errors: { address: 'invalid' } };
  }
  const record = input as Record<string, unknown>;
  if (Object.keys(record).some((key) => !ADDRESS_FIELDS.includes(key as AddressField))) {
    return { ok: false, errors: { address: 'invalid' } };
  }
  const errors: Partial<Record<AddressErrorKey, AddressProblem>> = {};
  const clean = { line1: '', line2: '', city: '', state: '', zip: '' };
  for (const field of ADDRESS_FIELDS) {
    const raw = record[field];
    if (raw !== undefined && raw !== null && typeof raw !== 'string') {
      errors[field] = 'invalid';
    } else {
      clean[field] = (raw ?? '').trim();
    }
  }
  clean.state = clean.state.toUpperCase();
  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }
  if (ADDRESS_FIELDS.every((field) => clean[field] === '')) {
    return { ok: true, address: null };
  }
  for (const field of ['line1', 'city', 'state', 'zip'] as const) {
    if (clean[field] === '') {
      errors[field] = 'required';
    }
  }
  const limits = { line1: NAME_PART_MAX_LENGTH, line2: NAME_PART_MAX_LENGTH, city: CITY_MAX_LENGTH } as const;
  for (const field of ['line1', 'line2', 'city'] as const) {
    if (errors[field]) {
      continue;
    }
    if (!isOneLine(clean[field], Number.MAX_SAFE_INTEGER)) {
      errors[field] = 'badChars';
    } else if ([...clean[field]].length > limits[field]) {
      errors[field] = 'tooLong';
    }
  }
  if (!errors.state && !STATE.test(clean.state)) {
    errors.state = 'badState';
  }
  if (!errors.zip && !ZIP.test(clean.zip)) {
    errors.zip = 'badZip';
  }
  return Object.keys(errors).length > 0 ? { ok: false, errors } : { ok: true, address: clean };
}
