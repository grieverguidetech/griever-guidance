import { shareService } from './templates.js';
import type { SessionDetails } from './types.js';

export type SectionKey =
  | 'person'
  | 'announcement'
  | 'service'
  | 'obituary'
  | 'thanks';

/** The real-world order of the sections (C10). */
export const SECTION_ORDER: readonly SectionKey[] = [
  'person',
  'announcement',
  'service',
  'obituary',
  'thanks',
];

export type SectionStatus = 'in_progress' | 'ready';

/**
 * Fields the editor stores per section. personName, dateOfPassing,
 * serviceDate, obituaryUrl and obituaryPublisher stay on `SessionDetails`.
 */
export interface SectionFields {
  birthDate?: string;
  serviceType?: string;
  serviceTime?: string;
  servicePlace?: string;
  serviceAddress?: string;
  serviceNotes?: string;
  serviceMessage?: string;
  announcementMessage?: string;
  obituaryText?: string;
  obituaryCity?: string;
  obituaryCareer?: string;
  obituarySurvivors?: string;
  obituaryNote?: string;
  thanksMessage?: string;
  /** A missing key means "Not started". */
  sectionStatus?: Partial<Record<SectionKey, SectionStatus>>;
}

type ServiceMessageInput = Pick<
  SessionDetails,
  'personName' | 'serviceDate' | 'obituaryUrl'
> &
  Pick<SectionFields, 'serviceTime' | 'servicePlace' | 'serviceAddress'> &
  Pick<SectionFields, 'serviceNotes'>;

/** The service message the family starts from, before they edit it. */
export function defaultServiceMessage(details: ServiceMessageInput): string {
  const serviceLocation = [details.servicePlace, details.serviceAddress]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part))
    .join(', ');

  return shareService.renderMessage({
    deceasedName: details.personName ?? '',
    serviceDate: details.serviceDate ?? '',
    serviceTime: details.serviceTime ?? '',
    serviceLocation,
    serviceNotes: details.serviceNotes ?? '',
    obituaryUrl: details.obituaryUrl ?? '',
  });
}
