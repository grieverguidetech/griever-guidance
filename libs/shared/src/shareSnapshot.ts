import type { SessionDetails } from './types.js';

/** One line of the checklist, in the order the family will meet it (C10). */
export interface ShareChecklistItem {
  label: string;
  done: boolean;
}

export interface ShareSnapshot {
  title: string;
  text: string;
}

/**
 * Only these fields can ever reach the snapshot. Contacts, contact ids,
 * recipient lists and message bodies are not on this type, and the builder
 * copies fields by name, so a full session can be passed in safely
 * (C2, C3, C4).
 */
export type ShareSessionDetails = Pick<
  SessionDetails,
  'personName' | 'dateOfPassing' | 'serviceDate' | 'obituaryUrl' | 'obituaryPublisher'
>;

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** "2026-05-29" -> "May 29, 2026". Anything the family typed is kept as typed. */
function readableDate(value: string): string {
  const trimmed = value.trim();
  if (!ISO_DAY.test(trimmed)) return trimmed;
  const date = new Date(`${trimmed}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return trimmed;
  return date.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/**
 * A plain-text, read-only copy of a person's details and checklist, for a
 * relative who offers to help. Pure and local: no network, no account (C5).
 * Checklist items are written in the order given, which must be the real
 * order of funeral planning (C10).
 */
export function buildShareSnapshot(
  session: ShareSessionDetails,
  checklist: ShareChecklistItem[],
): ShareSnapshot {
  const name = session.personName.trim();
  const title = name ? `Details for ${name}` : 'Details';

  const details: string[] = [];
  if (name) details.push(`Name: ${name}`);
  if (session.dateOfPassing?.trim()) {
    details.push(`Date of passing: ${readableDate(session.dateOfPassing)}`);
  }
  if (session.serviceDate?.trim()) {
    details.push(`Service: ${readableDate(session.serviceDate)}`);
  }
  if (session.obituaryUrl.trim()) {
    const publisher = session.obituaryPublisher?.trim();
    details.push(
      `Obituary: ${session.obituaryUrl.trim()}${publisher ? ` (${publisher})` : ''}`,
    );
  }

  const sections = [title];
  if (details.length > 0) sections.push(details.join('\n'));
  if (checklist.length > 0) {
    const lines = checklist.map((item) => `- ${item.done ? 'Done' : 'Not yet'}: ${item.label}`);
    sections.push(['Checklist, in order:', ...lines].join('\n'));
  }

  return { title, text: sections.join('\n\n') };
}
