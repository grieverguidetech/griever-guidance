import { sendCardStatus } from '@griever/hooks';
import type { Session } from '@griever/hooks';
import { parseCompleteDate } from '@griever/shared';
import type { MomentKey } from '@griever/shared';

/** The real funeral order. Never reordered. */
const ORDER: MomentKey[] = ['announce', 'service', 'obituary', 'thanks'];

export interface NextMomentInput {
  session: Session;
  /** Cards in the full plan: never lit. */
  locked: MomentKey[];
  /** The card of a send that was stopped part-way: it is lit, even though some people were told. */
  partial?: MomentKey | null;
  /** Read on each render. The hub re-renders when the app returns to the front, so a date passing overnight is picked up. */
  now?: Date;
}

/** A calendar day as a number, from the local year, month and day. */
const dayNumber = (date: Date): number => Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());

/**
 * Thank-yous wait until the service date is a complete date (with a four-digit year) before today.
 * Text such as "Nov 8" or "11/8" has no year, so it never counts (C10).
 */
export function serviceIsOver(serviceDate: string | undefined, now: Date): boolean {
  const parsed = parseCompleteDate(serviceDate);
  if (!parsed) {
    return false;
  }
  return dayNumber(parsed) < dayNumber(now);
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

/**
 * The card the bottom button names: the lit card, else the first card in order that is not done and
 * not locked (the thank-you date rule still applies), else the announcement.
 */
export function barMoment(input: NextMomentInput): MomentKey {
  const lit = nextMoment(input);
  if (lit) {
    return lit;
  }
  const { session, locked, now = new Date() } = input;
  const open = ORDER.find((key) => {
    if (locked.includes(key)) {
      return false;
    }
    const status = sendCardStatus(session, key);
    if (typeof status === 'object') {
      return false;
    }
    return key !== 'thanks' || serviceIsOver(session.serviceDate, now);
  });
  return open ?? 'announce';
}
