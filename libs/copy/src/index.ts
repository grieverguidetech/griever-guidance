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

/** What the obituary template reads. Names match the person's fields; dates and times are display text. */
export interface ObituaryDraftFields {
  personName?: string;
  obituaryCity?: string;
  dateOfPassing?: string;
  birthDate?: string;
  servicePlace?: string;
  serviceDate?: string;
  serviceTime?: string;
  serviceOfficiant?: string;
  burialPlace?: string;
  burialPrivate?: boolean;
  visitationPlace?: string;
  visitationDate?: string;
  visitationTime?: string;
  obituaryCareer?: string;
  obituarySurvivors?: string;
  obituaryNote?: string;
}

/** Trim, and drop one trailing full stop, for a value that sits before a full stop the template adds. */
function cleanEnd(value: string | undefined): string {
  return (value ?? '').trim().replace(/\.$/, '').trim();
}

/**
 * Fill the obituary template (five paragraphs, separated by a blank line). A field that is empty or
 * only spaces keeps its [BRACKET] from the copy, so the family sees what is missing. The final note
 * is trimmed only, because the template adds no full stop after it.
 */
export function buildObituaryDraft(fields: ObituaryDraftFields, copy: ScreenCopy<'obituaryDraft'>): string {
  const { blanks } = copy;
  const or = (value: string | undefined, blank: string): string => cleanEnd(value) || blank;
  const name = fields.personName?.trim() ?? '';

  const burial = fields.burialPrivate
    ? copy.burialPrivate
    : fill(copy.burialSentence, { burialPlace: or(fields.burialPlace, blanks.burialPlace) });

  const values = {
    fullName: name || blanks.fullName,
    name: name || blanks.name,
    city: or(fields.obituaryCity, blanks.city),
    dateOfPassing: or(fields.dateOfPassing, blanks.dateOfPassing),
    servicePlace: or(fields.servicePlace, blanks.servicePlace),
    serviceDate: or(fields.serviceDate, blanks.serviceDate),
    serviceTime: or(fields.serviceTime, blanks.serviceTime),
    officiant: or(fields.serviceOfficiant, blanks.officiant),
    burial,
    visitationPlace: or(fields.visitationPlace, blanks.visitationPlace),
    visitationDate: or(fields.visitationDate, blanks.visitationDate),
    visitationTime: or(fields.visitationTime, blanks.visitationTime),
    birthDate: or(fields.birthDate, blanks.birthDate),
    career: or(fields.obituaryCareer, blanks.career),
    survivors: or(fields.obituarySurvivors, blanks.survivors),
    note: fields.obituaryNote?.trim() || blanks.note,
  };

  return [copy.paragraph1, copy.paragraph2, copy.paragraph3, copy.paragraph4, copy.paragraph5]
    .map((paragraph) => fill(paragraph, values))
    .join('\n\n');
}

export { checklistDetail } from './checklistDetails';
export type { ChecklistDetail } from './checklistDetails';
