// Whether the family has started a phone flow on the web. With nothing, the phone shows a nudge
// instead of the message and send controls (#824). Pure: it only reads a person.
// It mirrors the empty summaries on the web Overview (apps/web/src/cms/Overview.tsx): the web only
// writes a message when the family edits the text, so the other "started" signals count too.
import { FLOW_DETAIL_TEXT_KEYS } from '@griever/shared';
import type { TemplateCategory } from '@griever/shared';

/** Any person's details; only the fields named below are read. */
export type WebContentSource = object;

const written = (value: unknown): boolean => typeof value === 'string' && value.trim() !== '';

// Every obituary text field (the text, the older fields and the new ones), as the web Overview reads them.
const OBITUARY_KEYS = FLOW_DETAIL_TEXT_KEYS.filter((key) => key.startsWith('obituary'));

export function hasWebContent(person: WebContentSource, category: TemplateCategory): boolean {
  const source = person as Record<string, unknown>;
  switch (category) {
    case 'announcement':
      return written(source.announcementMessage);
    case 'aftercare':
      return written(source.thanksMessage);
    case 'service':
      return [source.serviceMessage, source.serviceType, source.serviceDate, source.servicePlace].some(written);
    case 'obituary':
      return written(source.obituaryPublisher) || written(source.obituaryUrl) || OBITUARY_KEYS.some((key) => written(source[key]));
  }
}
