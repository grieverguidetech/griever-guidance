// Where a moment's first form starts from the details the family planned (and synced from the web).
// Pure: it reads a person and returns form fields plus an edited message, nothing else. It never
// touches contacts, drafts or recipients (C1, C3, C4).
import { FLOW_DETAIL_MAX_LENGTH } from './flowDetails.js';
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

// No entry for obituary: obituaryText is the email to the publisher, never the text message (#630).
const MESSAGE_KEY: Partial<Record<TemplateCategory, keyof SendPrefillSource>> = {
  service: 'serviceMessage',
  announcement: 'announcementMessage',
  aftercare: 'thanksMessage',
};

/** The planning message a phone edit is saved as (#1077). No entry for obituary: its link message is never saved. */
type PlannedMessageKey = 'announcementMessage' | 'serviceMessage' | 'thanksMessage';
const PLANNED_KEY: Partial<Record<TemplateCategory, PlannedMessageKey>> = {
  announcement: 'announcementMessage',
  service: 'serviceMessage',
  aftercare: 'thanksMessage',
};

export type PlannedMessagePatch = Partial<Record<PlannedMessageKey, string>>;

/**
 * A hand edit to the message on the phone, as the person's planning message, so the web shows it (#1077).
 * Only the announcement, service and thank-you, only when the family typed it (not the web's own wording),
 * and only when it differs from what is saved. The value is the edited message itself (`messageOverride`);
 * the per-person greeting is never part of it. A blank edit is not saved, so clearing the box never empties the web's wording.
 */
export function plannedMessagePatch(
  category: TemplateCategory | null,
  flowState: { messageOverride: string | null; messageFromWeb: boolean },
  session: Partial<Pick<SendPrefillSource, PlannedMessageKey>>,
): PlannedMessagePatch | null {
  const key = category ? PLANNED_KEY[category] : undefined;
  const edited = flowState.messageOverride;
  if (!key || flowState.messageFromWeb || edited === null || edited.trim() === '') {
    return null;
  }
  const saved = capForServer(key, edited);
  if (session[key] === saved) {
    return null;
  }
  return { [key]: saved };
}

// The server cuts text above its cap on a pull, which would shorten the open text; so the saved copy is cut here.
// A cut never leaves half of a surrogate pair.
function capForServer(key: PlannedMessageKey, value: string): string {
  const max = FLOW_DETAIL_MAX_LENGTH[key];
  if (value.length <= max) {
    return value;
  }
  const cut = value.slice(0, max);
  const last = cut.charCodeAt(cut.length - 1);
  return last >= 0xd800 && last <= 0xdbff ? cut.slice(0, -1) : cut;
}

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
  const key = MESSAGE_KEY[category];
  const message = key ? source[key] : null;
  return { fields, messageOverride: message ?? null };
}
