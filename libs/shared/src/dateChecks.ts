import { parseCompleteDate, parseLooseDate } from './dates.js';

/** What a date field should quietly mention. Never a reason to block saving. */
export type DateNoteKind = 'unreadable' | 'beforePassing' | 'futurePassing' | 'birthAfterPassing';

export interface DateCheckContext {
  /** Which field the text belongs to. */
  field: 'birth' | 'passing' | 'event';
  /** The date of passing as typed, for the birth and event checks. */
  dateOfPassing?: string | null;
  /** Today. Defaults to the current date; tests pass a fixed one. */
  today?: Date;
}

/** Year, month and day as one number, so two dates compare by calendar day only. */
function dayNumber(date: Date): number {
  return date.getFullYear() * 10000 + (date.getMonth() + 1) * 100 + date.getDate();
}

/**
 * A complete date, or null. Partial text like "May 2" is null here, because a
 * parser would fill in a year while the family is still typing.
 */
function completeDay(text: string | null | undefined): number | null {
  const date = parseCompleteDate(text);
  return date ? dayNumber(date) : null;
}

/**
 * A quiet note for a typed date, or null when nothing is worth saying.
 * Empty text gets no note. The note is a hint only; the caller still saves
 * what was typed.
 */
export function dateNote(text: string | null | undefined, context: DateCheckContext): DateNoteKind | null {
  if (!text?.trim()) {
    return null;
  }
  if (!parseLooseDate(text)) {
    return 'unreadable';
  }
  const day = completeDay(text);
  if (day === null) {
    return null;
  }
  if (context.field === 'passing') {
    return day > dayNumber(context.today ?? new Date()) ? 'futurePassing' : null;
  }
  const passing = completeDay(context.dateOfPassing);
  if (passing === null) {
    return null;
  }
  if (context.field === 'birth') {
    return day > passing ? 'birthAfterPassing' : null;
  }
  return day < passing ? 'beforePassing' : null;
}
