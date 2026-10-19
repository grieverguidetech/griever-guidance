import type { RecipientProgress } from '@griever/hooks';

type Category = 'announcement' | 'service' | 'aftercare' | 'obituary' | null;

const ALL_TOLD: Record<NonNullable<Category>, string> = {
  announcement: 'Everyone has been told.',
  service: 'The service details have been shared.',
  obituary: 'The obituary has been shared.',
  aftercare: 'Your thank-yous have been sent.',
};

/** Shown under the note on Home (C2: nothing of the message is kept here). */
export const NO_COPY_LINE = "We don't keep a copy of what was sent — it's already where it belongs, in your own Messages app.";

/** The calm line shown on Home when the last person has been dealt with. No exclamation points (C7). */
export function sendNote(category: Category, recipients: RecipientProgress[]): string {
  if (recipients.length === 0) return category ? ALL_TOLD[category] : 'Your messages have been sent.';
  const told = recipients.filter((r) => r.status === 'delivered').length;
  if (recipients.some((r) => r.status === 'skipped')) {
    return `You told ${told} of ${recipients.length}. You can text the others from your own Messages app any time.`;
  }
  return category ? ALL_TOLD[category] : 'Your messages have been sent.';
}
