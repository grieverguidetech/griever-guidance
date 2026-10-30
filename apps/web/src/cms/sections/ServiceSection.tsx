import { useId } from 'react';
import { screenCopy } from '@griever/copy';
import {
  defaultServiceEventsMessage,
  type SectionFields,
  type ServiceEventFields,
  type SessionDetails,
} from '@griever/shared';
import { EventFields } from './EventFields';
import { MarkReady } from './MarkReady';

const copy = screenCopy('cmsService');

type ServiceValues = Partial<
  Pick<SessionDetails, 'personName' | 'serviceDate' | 'obituaryUrl'> &
    Omit<SectionFields, 'sectionStatus'> &
    ServiceEventFields
> &
  Pick<SectionFields, 'sectionStatus'>;

export type ServicePatch = Partial<Omit<ServiceValues, 'sectionStatus' | 'personName' | 'obituaryUrl'>>;

interface Props {
  values: ServiceValues;
  /** Gets only the field that changed. There is no Save button; the editor saves as you go. */
  onChange: (patch: ServicePatch) => void;
  onReadyChange: (ready: boolean) => void;
}

/** Service events, notes and the message. The message follows the details until the family edits it. */
export function ServiceSection({ values, onChange, onReadyChange }: Props) {
  const id = useId();
  const prefill = defaultServiceEventsMessage({
    personName: values.personName ?? '',
    serviceDate: values.serviceDate,
    obituaryUrl: values.obituaryUrl ?? '',
    serviceTime: values.serviceTime,
    servicePlace: values.servicePlace,
    serviceAddress: values.serviceAddress,
    serviceNotes: values.serviceNotes,
    visitationDate: values.visitationDate,
    visitationTime: values.visitationTime,
    visitationPlace: values.visitationPlace,
    burialDate: values.burialDate,
    burialTime: values.burialTime,
    burialPlace: values.burialPlace,
    burialPrivate: values.burialPrivate,
    receptionDate: values.receptionDate,
    receptionTime: values.receptionTime,
    receptionPlace: values.receptionPlace,
  });
  const edited = values.serviceMessage !== undefined;

  return (
    <div className="flex flex-col gap-6">
      <EventFields
        legend={copy.eventVisitation}
        keys={{ date: 'visitationDate', time: 'visitationTime', place: 'visitationPlace' }}
        values={values}
        onChange={onChange}
      />
      <EventFields
        legend={copy.eventFuneral}
        keys={{ date: 'serviceDate', time: 'serviceTime', place: 'servicePlace' }}
        values={values}
        onChange={onChange}
        extra={
          <>
            <div className="gg-field">
              <label htmlFor={`${id}-type`}>{copy.typeLabel}</label>
              <input
                id={`${id}-type`}
                type="text"
                className="gg-input"
                autoComplete="off"
                placeholder={copy.typePlaceholder}
                value={values.serviceType ?? ''}
                onChange={(e) => onChange({ serviceType: e.target.value })}
              />
            </div>
            <div className="gg-field">
              <label htmlFor={`${id}-address`}>{copy.addressLabel}</label>
              <input
                id={`${id}-address`}
                type="text"
                className="gg-input"
                autoComplete="street-address"
                value={values.serviceAddress ?? ''}
                onChange={(e) => onChange({ serviceAddress: e.target.value })}
              />
            </div>
            <div className="gg-field">
              <label htmlFor={`${id}-officiant`}>{copy.eventOfficiant}</label>
              <input
                id={`${id}-officiant`}
                type="text"
                className="gg-input"
                autoComplete="off"
                value={values.serviceOfficiant ?? ''}
                onChange={(e) => onChange({ serviceOfficiant: e.target.value })}
              />
            </div>
          </>
        }
      />
      {/* The checkbox sits outside the fields so it keeps focus when they hide. */}
      <div className="flex flex-col gap-4">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={values.burialPrivate === true}
            onChange={(e) => onChange({ burialPrivate: e.target.checked })}
          />
          {copy.eventPrivateFamily}
        </label>
        {values.burialPrivate !== true && (
          <EventFields
            legend={copy.eventBurial}
            keys={{ date: 'burialDate', time: 'burialTime', place: 'burialPlace' }}
            values={values}
            onChange={onChange}
            placeLabel={copy.eventCemetery}
          />
        )}
      </div>
      <EventFields
        legend={copy.eventReception}
        keys={{ date: 'receptionDate', time: 'receptionTime', place: 'receptionPlace' }}
        values={values}
        onChange={onChange}
      />
      <div className="gg-field">
        <label htmlFor={`${id}-notes`}>{copy.notesLabel}</label>
        <textarea
          id={`${id}-notes`}
          className="gg-input"
          rows={3}
          value={values.serviceNotes ?? ''}
          onChange={(e) => onChange({ serviceNotes: e.target.value })}
        />
      </div>
      <div className="gg-field">
        <label htmlFor={`${id}-message`}>{copy.messageLabel}</label>
        <p id={`${id}-message-hint`}>{copy.messageHint}</p>
        <textarea
          id={`${id}-message`}
          aria-describedby={`${id}-message-hint`}
          className="gg-input"
          rows={8}
          value={values.serviceMessage ?? prefill}
          onChange={(e) => onChange({ serviceMessage: e.target.value })}
        />
        {edited && (
          <button
            type="button"
            className="gg-btn gg-btn-secondary"
            onClick={() => onChange({ serviceMessage: undefined })}
          >
            {copy.useDetails}
          </button>
        )}
      </div>
      <MarkReady ready={values.sectionStatus?.service === 'ready'} onChange={onReadyChange} />
    </div>
  );
}
