/**
 * `SessionDetails.dateOfPassing`/`serviceDate` are stored as whatever the
 * family typed ("May 29, 2026") or an ISO date, per `apps/web`'s
 * `DateField.tsx` convention — this parses either into a real `Date` for
 * math (e.g. contact retention), without pulling in a date library.
 */
export function parseLooseDate(value: string | undefined | null): Date | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

const MONTHS = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
];

const MIN_YEAR = 2000;
const MAX_YEAR = 2100;

function monthFromName(name: string): number | null {
  const lower = name.toLowerCase().replace(/\.$/, '');
  if (lower === 'sept') return 9;
  const index = MONTHS.findIndex((m) => m === lower || (lower.length === 3 && m.startsWith(lower)));
  return index === -1 ? null : index + 1;
}

/**
 * Strict counterpart to `parseLooseDate`, for anything that DELETES or
 * EXPIRES data (contact retention). Returns a Date only for a complete date:
 * an explicit four-digit year in 2000-2100, a real month and a real day.
 * Accepted: "2026-05-29" (zero-padded), "5/29/2026", "May 29, 2026" (also "May 29 2026",
 * "Sept. 5, 2026"). Anything partial that someone may still be typing
 * ("6", "6/12", "May 2", "May 29, 202") is null, because `new Date` would
 * fill in a year like 2001 and a wrong, long-past date must never start a
 * deletion clock.
 */
export function parseCompleteDate(value: string | undefined | null): Date | null {
  const text = value?.trim();
  if (!text) return null;

  let year: number;
  let month: number | null;
  let day: number;

  let match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (match) {
    [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  } else if ((match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text))) {
    [month, day, year] = [Number(match[1]), Number(match[2]), Number(match[3])];
  } else if ((match = /^([A-Za-z]+\.?)\s+(\d{1,2}),?\s+(\d{4})$/.exec(text))) {
    [month, day, year] = [monthFromName(match[1]), Number(match[2]), Number(match[3])];
  } else {
    return null;
  }

  if (month === null || year < MIN_YEAR || year > MAX_YEAR) return null;
  const date = new Date(year, month - 1, day);
  // Rejects overflow such as Feb 30 or month 13 rolling into the next period.
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }
  return date;
}

export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

const MONTH_TITLES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/**
 * A date from a date picker, written the way the session stores `dateOfPassing`
 * ("June 7, 2025"; the same text web's `DateField` writes), so messages and sync are unchanged.
 * Uses the local day, and does not depend on Intl.
 */
export function formatPassingDate(date: Date): string {
  return `${MONTH_TITLES[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}

/** A stored `dateOfPassing` as the date a picker should open on; null when it is empty or not a complete date. */
export function passingDateFromText(value: string | undefined | null): Date | null {
  return parseCompleteDate(value);
}
