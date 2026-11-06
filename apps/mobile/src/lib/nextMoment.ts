import { sendCardStatus } from '@griever/hooks';
import type { Session } from '@griever/hooks';
import { parseLooseDate } from '@griever/shared';
import type { MomentKey } from '@griever/shared';

/** The real funeral order. Never reordered. */
const ORDER: MomentKey[] = ['announce', 'service', 'obituary', 'thanks'];

export interface NextMomentInput {
  session: Session;
  /** Cards in the full plan: never lit. */
  locked: MomentKey[];
  /** The card of a send that was stopped part-way: it is lit, even though some people were told. */
  partial?: MomentKey | null;
  now?: Date;
}

/** A calendar day as a number. A date typed as 2026-11-05 is that day anywhere, so it is read as UTC. */
function dayNumber(text: string, date: Date): number {
  const isoOnly = /^\d{4}-\d{2}-\d{2}$/.test(text.trim());
  const year = isoOnly ? date.getUTCFullYear() : date.getFullYear();
  const month = isoOnly ? date.getUTCMonth() : date.getMonth();
  const day = isoOnly ? date.getUTCDate() : date.getDate();
  return Date.UTC(year, month, day);
}

/** Thank-yous wait until the service date is a real date before today. Missing or unreadable never counts. */
export function serviceIsOver(serviceDate: string | undefined, now: Date): boolean {
  const parsed = parseLooseDate(serviceDate);
  if (!parsed || !serviceDate) {
    return false;
  }
  return dayNumber(serviceDate, parsed) < dayNumber('', now);
}

/**
 * The one card to light: a stopped send first, else the first card in order that is not done, not
 * locked and Ready (the obituary also when waiting for its link). Null when none qualifies (the bottom button then offers the announcement).
 */
export function nextMoment({ session, locked, partial = null, now = new Date() }: NextMomentInput): MomentKey | null {
  if (partial && !locked.includes(partial)) {
    return partial;
  }
  for (const key of ORDER) {
    if (locked.includes(key)) {
      continue;
    }
    const status = sendCardStatus(session, key);
    // The obituary is also eligible once its text is written and only the link is missing.
    if (status !== 'ready' && !(key === 'obituary' && status === 'waitingForLink')) {
      continue;
    }
    if (key === 'thanks' && !serviceIsOver(session.serviceDate, now)) {
      continue;
    }
    return key;
  }
  return null;
}
