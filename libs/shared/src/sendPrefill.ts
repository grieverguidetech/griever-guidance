// Where a moment's first form starts from the details the family planned (and synced from the web).
// Pure: it reads a person and returns form fields plus an edited message, nothing else. It never
// touches contacts, drafts or recipients (C1, C3, C4).
import type { SectionFields } from './sections.js';
import type { SessionDetails, TemplateCategory } from './types.js';

export type SendPrefillSource = Pick<
  SessionDetails,
  'personName' | 'dateOfPassing' | 'serviceDate'
> &
  Partial<Pick<SessionDetails, 'senderName'>> &
  Pick<
    SectionFields,
    | 'serviceTime'
    | 'servicePlace'
    | 'serviceAddress'
    | 'serviceNotes'
    | 'serviceMessage'
    | 'announcementMessage'
    | 'obituaryText'
    | 'thanksMessage'
  >;

export type SendPrefill = {
  /** Only fields that have a value. Callers keep the ones their template asks for. */
  fields: Record<string, string>;
  /** The family's edited wording. null means none: the message follows the fields. '' stays ''. */
  messageOverride: string | null;
};

const MESSAGE_KEY: Record<TemplateCategory, keyof SendPrefillSource> = {
  service: 'serviceMessage',
  announcement: 'announcementMessage',
  obituary: 'obituaryText',
  aftercare: 'thanksMessage',
};

const text = (value: string | null | undefined): string => value?.trim() ?? '';

/** Place and address as one line, skipping a missing part. */
function joinLocation(place: string | null | undefined, address: string | null | undefined): string {
  return [text(place), text(address)].filter(Boolean).join(', ');
}

export function sendPrefill(
  source: SendPrefillSource,
  category: TemplateCategory,
): SendPrefill {
  const candidates: Record<string, string> = {
    deceasedName: text(source.personName),
    // Local only: senderName never syncs, but the thank-you form asks for it, and typing it would clear the message.
    senderName: text(source.senderName),
    dateOfPassing: text(source.dateOfPassing),
    serviceDate: text(source.serviceDate),
    serviceTime: text(source.serviceTime),
    serviceLocation: joinLocation(source.servicePlace, source.serviceAddress),
    serviceNotes: text(source.serviceNotes),
  };
  const fields: Record<string, string> = {};
  for (const [key, value] of Object.entries(candidates)) {
    if (value) {
      fields[key] = value;
    }
  }
  const message = source[MESSAGE_KEY[category]];
  return { fields, messageOverride: message ?? null };
}
