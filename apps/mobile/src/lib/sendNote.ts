import type { RecipientProgress } from '@griever/hooks';
import { fill, screenCopy } from '@griever/copy';
import type { MomentKey, TemplateCategory } from '@griever/shared';

const { finishNote } = screenCopy('pathLanding');

type Category = TemplateCategory | null;

const MOMENT_BY_CATEGORY: Record<TemplateCategory, MomentKey> = {
  announcement: 'announce',
  service: 'service',
  obituary: 'obituary',
  aftercare: 'thanks',
};

/** The note on Home after a send: `lead` in bold italic, `rest` in italic, `spoken` for the screen reader. */
export interface SentNoteText {
  lead: string;
  rest: string;
  /** The same words as the visible note (lead and rest), for the iOS announcement. */
  spoken: string;
}

/** The calm note shown on Home when the last person has been dealt with. No exclamation points (C7). */
export function sendNote(category: Category, recipients: RecipientProgress[]): SentNoteText {
  const total = recipients.length;
  const told = recipients.filter((r) => r.status === 'delivered').length;
  if (total > 0 && told === 0) {
    // Nothing was sent, so there is no privacy line (C2 applies only to what was sent).
    return { ...finishNote.none, spoken: `${finishNote.none.lead} ${finishNote.none.rest}` };
  }
  if (total > 0 && told < total) {
    const lead = fill(finishNote.partial.lead, { told, total });
    return {
      lead,
      rest: `${finishNote.partial.rest} ${finishNote.noCopy}`,
      spoken: `${lead} ${finishNote.partial.rest} ${finishNote.noCopy}`,
    };
  }
  const lead = category ? finishNote.allTold[MOMENT_BY_CATEGORY[category]] : finishNote.sentGeneric;
  return { lead, rest: finishNote.noCopy, spoken: `${lead} ${finishNote.noCopy}` };
}
