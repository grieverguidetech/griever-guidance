import type { SectionFields } from './sections.js';
import { shareService } from './templates.js';
import type { SessionDetails } from './types.js';

/** Fields for the other service events. The main service stays in `SectionFields`. */
export interface ServiceEventFields {
  visitationDate?: string;
  visitationTime?: string;
  visitationPlace?: string;
  serviceOfficiant?: string;
  burialDate?: string;
  burialTime?: string;
  /** The cemetery. */
  burialPlace?: string;
  burialPrivate?: boolean;
  receptionDate?: string;
  receptionTime?: string;
  receptionPlace?: string;
}

type ServiceEventsInput = Pick<
  SessionDetails,
  'personName' | 'serviceDate' | 'obituaryUrl'
> &
  Pick<
    SectionFields,
    'serviceTime' | 'servicePlace' | 'serviceAddress' | 'serviceNotes'
  > &
  ServiceEventFields;

/**
 * The service message with the extra events added, in order: service,
 * visitation, burial, reception, then the obituary link. The officiant is
 * not part of the message. It is the share-service template's own wording,
 * so the web preview and the phone cannot drift.
 */
export function defaultServiceEventsMessage(
  details: ServiceEventsInput,
): string {
  const location = [details.servicePlace, details.serviceAddress]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(', ');
  return shareService.renderMessage({
    deceasedName: details.personName ?? '',
    serviceDate: details.serviceDate ?? '',
    serviceTime: details.serviceTime ?? '',
    serviceLocation: location,
    serviceNotes: details.serviceNotes ?? '',
    obituaryUrl: details.obituaryUrl ?? '',
    ...serviceEventFieldMap(details),
  });
}

/** The extra events as the template's string field map. Empty values are left out. */
export function serviceEventFieldMap(
  source: ServiceEventFields,
): Record<string, string> {
  const map: Record<string, string> = {};
  const keys = [
    'visitationDate', 'visitationTime', 'visitationPlace',
    'burialDate', 'burialTime', 'burialPlace',
    'receptionDate', 'receptionTime', 'receptionPlace',
  ] as const;
  for (const key of keys) {
    const value = source[key]?.trim();
    if (value) {
      map[key] = value;
    }
  }
  if (source.burialPrivate === true) {
    map['burialPrivate'] = 'true';
  }
  return map;
}
