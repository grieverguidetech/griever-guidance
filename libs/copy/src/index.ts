import { screens } from './screens';
import type { ScreenName } from './screens';

/**
 * Screen copy, one JSON file per screen in libs/copy/screens/. Each file has a JSON Schema of the
 * same name in libs/copy/schemas/; copy.spec.ts checks the two agree.
 */
export type { ScreenName } from './screens';

/** The shape of one screen's copy, read from its JSON file. */
export type ScreenCopy<Name extends ScreenName> = (typeof screens)[Name];

export const screenNames = Object.keys(screens) as ScreenName[];

export function screenCopy<Name extends ScreenName>(name: Name): ScreenCopy<Name> {
  return screens[name];
}

export { findHardCodedCopy } from './hardCodedCopy';

const PLACEHOLDER = /\{(\w+)\}/g;

/**
 * Bundlers replace `process.env.NODE_ENV` with a literal at build time (Vite and Metro both do).
 * If one does not, `process` may not exist in a browser, so the read is guarded and the answer
 * is "not production", which is the strict choice.
 */
function isProductionBuild(): boolean {
  try {
    return process.env.NODE_ENV === 'production';
  } catch {
    return false;
  }
}

/**
 * Fill `{name}`-style placeholders. A placeholder with no value throws, so a typo shows up in dev
 * and in tests. In a production build it is left as written instead, because a thrown error would
 * blank the screen for someone who is already having a hard day.
 */
export function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(PLACEHOLDER, (whole, key: string) => {
    const value = values[key];
    if (value !== undefined) {
      return String(value);
    }
    if (isProductionBuild()) {
      return whole;
    }
    throw new Error(`Missing value for {${key}} in "${template}"`);
  });
}

/** The small grey line under a finished step: "2 people · May 30 · Send again". */
export function doneRowMeta(
  copy: ScreenCopy<'pathLanding'>,
  row: { recipientCount?: number; dateLabel?: string; started: boolean },
): string {
  const count = row.recipientCount ?? 0;
  const people = `${count} ${count === 1 ? copy.person : copy.people}`;
  const date = row.dateLabel ? ` · ${row.dateLabel}` : '';
  return `${people}${date} · ${row.started ? copy.metaStarted : copy.metaSendAgain}`;
}

/** The "From your details" line on Announce the passing: "Name · passed date · from sender". */
export function announceRecap(
  session: { personName?: string; dateOfPassing?: string | null; senderName?: string } | null | undefined,
  copy: ScreenCopy<'announce'>,
): string {
  const name = session?.personName?.trim();
  const date = session?.dateOfPassing?.trim();
  const sender = session?.senderName?.trim();
  return [
    name || copy.recap.nameFallback,
    date ? fill(copy.recap.passed, { date }) : copy.recap.dateNotSet,
    sender ? fill(copy.recap.from, { sender }) : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

/** "1 person" or "3 people". */
export function recipientsPhrase(count: number, copy: ScreenCopy<'review'>): string {
  return `${count} ${count === 1 ? copy.person : copy.people}`;
}

/** The send button on Review: "Text 1 person", "Text 2 people", or "Text these people" when there is no count. */
export function sendLabel(count: number | undefined, copy: ScreenCopy<'review'>): string {
  if (!count) {
    return copy.sendFallback;
  }
  return fill(copy.send, { recipients: recipientsPhrase(count, copy) });
}
