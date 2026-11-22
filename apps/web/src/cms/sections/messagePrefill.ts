import { fill, screenCopy } from '@griever/copy';
import { announcePassing } from '@griever/shared';

const thanksCopy = screenCopy('cmsThanks');

/** The announcement text shown until the family edits it. */
export function announcementPrefill({ personName, dateOfPassing }: { personName?: string | null; dateOfPassing?: string | null }): string {
  return announcePassing.renderMessage({
    deceasedName: personName ?? '',
    dateOfPassing: dateOfPassing ?? '',
  });
}

/** The thank-you text shown until the family edits it. */
export function thanksPrefill({ personName }: { personName?: string | null }): string {
  const name = personName?.trim() || thanksCopy.nameFallback;
  return fill(thanksCopy.template, { deceasedName: name });
}

const SUMMARY_MAX = 80;

/**
 * First non-empty line of the text, for a one-line card. A long line is cut at the last
 * space within 80 characters so a screen reader never reads half a word. With no space, it is cut hard.
 */
export function summaryLine(text: string): string {
  const line = text
    .split('\n')
    .map((part) => part.trim())
    .find(Boolean);
  if (!line) {
    return '';
  }
  if (line.length <= SUMMARY_MAX) {
    return line;
  }
  const head = line.slice(0, SUMMARY_MAX + 1);
  const lastSpace = head.lastIndexOf(' ');
  const cut = lastSpace > 0 ? head.slice(0, lastSpace) : line.slice(0, SUMMARY_MAX);
  return `${cut.replace(/[\s,;:.\-]+$/, '')}…`;
}
