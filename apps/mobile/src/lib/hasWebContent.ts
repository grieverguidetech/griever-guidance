// Whether the family has written anything on the web for a phone flow. With nothing, the phone shows
// a nudge to the web instead of the message and send controls (#824). Pure: it only reads a person.
import type { TemplateCategory } from '@griever/shared';

type Text = string | null | undefined;

/** What the rule reads: the person's web message fields, obituary text and link. */
export interface WebContentSource {
  announcementMessage?: Text;
  serviceMessage?: Text;
  thanksMessage?: Text;
  obituaryText?: Text;
  obituaryUrl?: Text;
}

const written = (value: Text): boolean => (value?.trim() ?? '') !== '';

const MESSAGE_KEY = {
  announcement: 'announcementMessage',
  service: 'serviceMessage',
  aftercare: 'thanksMessage',
} as const;

export function hasWebContent(source: WebContentSource, category: TemplateCategory): boolean {
  if (category === 'obituary') {
    return written(source.obituaryText) || written(source.obituaryUrl);
  }
  const key = MESSAGE_KEY[category as keyof typeof MESSAGE_KEY];
  return key ? written(source[key]) : true;
}
