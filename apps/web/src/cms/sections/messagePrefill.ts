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
