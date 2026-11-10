import { screenCopy } from '@griever/copy';
import type { dateNote } from '@griever/shared';

const copy = screenCopy('cmsPerson');

/** The note props for a person date field. The unreadable note waits for the field to lose focus; the others show at once. */
export function dateNoteProps(kind: ReturnType<typeof dateNote>) {
  if (kind === 'unreadable') {
    return { noteOnBlur: copy.dateUnreadable };
  }
  if (kind === 'birthAfterPassing') {
    return { note: copy.birthAfterPassing };
  }
  if (kind === 'futurePassing') {
    return { note: copy.futurePassing };
  }
  return {};
}
