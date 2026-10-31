import { defaultServiceMessage, type SectionFields } from './sections.js';
import { normalizeUrl } from './templates.js';
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

function clean(value: string | undefined): string {
  return (value?.trim() ?? '').replace(/\.$/, '').trim();
}

/** "<lead> at <place> on <date> at <time>." with only the parts that are set, or '' if none. */
function eventSentence(
  lead: string,
  place: string | undefined,
  date: string | undefined,
  time: string | undefined,
): string {
  const parts = [
    clean(place) && `at ${clean(place)}`,
    clean(date) && `on ${clean(date)}`,
    clean(time) && `at ${clean(time)}`,
  ].filter(Boolean);
  if (parts.length === 0) {
    return '';
  }
  return `${lead} ${parts.join(' ')}.`;
}

/**
 * The service message with the extra events added, in order: service,
 * visitation, burial, reception, then the obituary link. The officiant is
 * not part of the message.
 */
export function defaultServiceEventsMessage(
  details: ServiceEventsInput,
): string {
  const sentences = [
    eventSentence(
      'Visitation will be held',
      details.visitationPlace,
      details.visitationDate,
      details.visitationTime,
    ),
    details.burialPrivate
      ? 'The burial will be private.'
      : eventSentence(
          'The burial will be held',
          details.burialPlace,
          details.burialDate,
          details.burialTime,
        ),
    eventSentence(
      'A reception will be held',
      details.receptionPlace,
      details.receptionDate,
      details.receptionTime,
    ),
  ].filter(Boolean);

  const service = defaultServiceMessage({ ...details, obituaryUrl: '' }).trim();
  // An empty service message stays empty, so no stray full stop is added.
  const closedService = service && !/[.?]$/.test(service) ? `${service}.` : service;
  const body = [closedService, ...sentences].filter(Boolean).join(' ');
  const url = normalizeUrl(details.obituaryUrl);
  return url ? `${body}\n\n${url}` : body;
}
