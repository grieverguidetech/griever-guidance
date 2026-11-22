// Whether the family has marked a phone flow Ready on the web. Without it, the phone shows a nudge
// instead of the message and send controls (#824, #949). Pure: it only reads a person.
// The web does not save an untouched, prefilled message, so edited text says nothing about whether
// the step is done. The Ready status (synced as sectionStatus) is the signal, for all 4 steps.
import type { SectionKey, TemplateCategory } from '@griever/shared';

/** Any person's details; only `sectionStatus` is read. */
export type WebContentSource = object;

const STATUS_KEY: Record<TemplateCategory, SectionKey> = {
  announcement: 'announcement',
  service: 'service',
  aftercare: 'thanks',
  obituary: 'obituary',
};

export function isMarkedReady(person: WebContentSource, category: TemplateCategory): boolean {
  const status = (person as { sectionStatus?: Partial<Record<SectionKey, string>> }).sectionStatus;
  return status?.[STATUS_KEY[category]] === 'ready';
}
