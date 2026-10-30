import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { screenCopy } from '@griever/copy';
import {
  defaultServiceEventsMessage,
  type SectionFields,
  type SectionKey,
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
  /** The next section still to do, or null when none is left. */
  nextSection?: SectionKey | null;
  onNext?: () => void;
}

/** A text field named "legend label" like the base fields of an event group. */
function GroupText({
  id,
  legendId,
  label,
  placeholder,
  autoComplete = 'off',
  value,
  onChange,
}: {
  id: string;
  legendId: string;
  label: string;
  placeholder?: string;
  autoComplete?: string;
  value: string | undefined;
  onChange: (value: string) => void;
}) {
  return (
    <div className="gg-field">
      <label id={`${id}-label`} htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        aria-labelledby={`${legendId} ${id}-label`}
        type="text"
        className="gg-input"
        autoComplete={autoComplete}
        placeholder={placeholder}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

/**
 * A group behind an "Add ..." button. Once opened it stays open (one way, no collapse), so nothing
 * the family typed can be hidden or lost. It is an action button, not a toggle, so it has no
 * aria-expanded. The button goes away on open, so focus moves to the group's fieldset (named by its
 * legend), not an input, so the phone keyboard does not open.
 */
function Disclosure({
  open,
  onOpen,
  buttonLabel,
  children,
}: {
  open: boolean;
  onOpen: () => void;
  buttonLabel: string;
  children: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const moveFocus = useRef(false);
  useEffect(() => {
    if (open && moveFocus.current) {
      moveFocus.current = false;
      panelRef.current?.querySelector<HTMLElement>('fieldset')?.focus();
    }
  }, [open]);
  return (
    <div>
      {!open && (
        <button
          type="button"
          className="gg-btn gg-btn-secondary min-h-[44px]"
          onClick={() => {
            moveFocus.current = true;
            onOpen();
          }}
        >
          {buttonLabel}
        </button>
      )}
      <div ref={panelRef}>
        {open && children}
      </div>
    </div>
  );
}

/** Offers the funeral service's value for an empty group field, when the service has one. */
const sameAs = (serviceValue: string | undefined, label: string, use: (v: string) => void) =>
  serviceValue ? { label, onUse: () => use(serviceValue) } : undefined;

const hasText = (...vs: (string | boolean | undefined)[]) => vs.some((v) => v === true || (typeof v === 'string' && v !== ''));

/** Service events, notes and the message. The message follows the details until the family edits it. */
export function ServiceSection({ values, onChange, onReadyChange, nextSection, onNext }: Props) {
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
  const messageRef = useRef<HTMLTextAreaElement>(null);
  const edited = values.serviceMessage !== undefined;
  // A group with data opens on its own; one the family opened stays open.
  const [opened, setOpened] = useState({ visitation: false, burial: false, reception: false });
  const withData = {
    visitation: hasText(values.visitationDate, values.visitationTime, values.visitationPlace),
    burial: hasText(values.burialDate, values.burialTime, values.burialPlace, values.burialPrivate),
    reception: hasText(values.receptionDate, values.receptionTime, values.receptionPlace),
  };
  // Remember data-opened groups too, so clearing a field never closes the group under the cursor.
  const open = {
    visitation: opened.visitation || withData.visitation,
    burial: opened.burial || withData.burial,
    reception: opened.reception || withData.reception,
  };
  if (
    (withData.visitation && !opened.visitation) ||
    (withData.burial && !opened.burial) ||
    (withData.reception && !opened.reception)
  ) {
    setOpened(open);
  }
  const openGroup = (g: keyof typeof opened) => setOpened((o) => ({ ...o, [g]: true }));

  return (
    <div className="flex flex-col gap-6">
      <p>{copy.intro}</p>
      <Disclosure open={open.visitation} onOpen={() => openGroup('visitation')} buttonLabel={copy.addVisitation}>
      <EventFields
        legend={copy.eventVisitation}
        keys={{ date: 'visitationDate', time: 'visitationTime', place: 'visitationPlace' }}
        values={values}
        onChange={onChange}
        dateSuggestion={sameAs(values.serviceDate, copy.sameDay, (visitationDate) => onChange({ visitationDate }))}
        placeSuggestion={sameAs(values.servicePlace, copy.samePlace, (visitationPlace) => onChange({ visitationPlace }))}
      />
      </Disclosure>
      <EventFields
        legend={copy.eventFuneral}
        keys={{ date: 'serviceDate', time: 'serviceTime', place: 'servicePlace' }}
        values={values}
        onChange={onChange}
        extra={(legendId) => (
          <>
            <GroupText
              id={`${id}-type`}
              legendId={legendId}
              label={copy.typeLabel}
              placeholder={copy.typePlaceholder}
              value={values.serviceType}
              onChange={(serviceType) => onChange({ serviceType })}
            />
            <GroupText
              id={`${id}-address`}
              legendId={legendId}
              label={copy.addressLabel}
              autoComplete="street-address"
              value={values.serviceAddress}
              onChange={(serviceAddress) => onChange({ serviceAddress })}
            />
            <GroupText
              id={`${id}-officiant`}
              legendId={legendId}
              label={copy.eventOfficiant}
              value={values.serviceOfficiant}
              onChange={(serviceOfficiant) => onChange({ serviceOfficiant })}
            />
          </>
        )}
      />
      <Disclosure open={open.burial} onOpen={() => openGroup('burial')} buttonLabel={copy.addBurial}>
      <EventFields
        legend={copy.eventBurial}
        keys={{ date: 'burialDate', time: 'burialTime', place: 'burialPlace' }}
        values={values}
        onChange={onChange}
        placeLabel={copy.eventCemetery}
        dateSuggestion={sameAs(values.serviceDate, copy.sameDay, (burialDate) => onChange({ burialDate }))}
        hideFields={values.burialPrivate === true}
        lead={
          <label className="flex items-center gap-3 min-h-[44px] cursor-pointer">
            <input
              type="checkbox"
              className="h-5 w-5 m-0"
              checked={values.burialPrivate === true}
              onChange={(e) => onChange({ burialPrivate: e.target.checked })}
            />
            {copy.eventPrivateFamily}
          </label>
        }
      />
      </Disclosure>
      <Disclosure open={open.reception} onOpen={() => openGroup('reception')} buttonLabel={copy.addReception}>
      <EventFields
        legend={copy.eventReception}
        keys={{ date: 'receptionDate', time: 'receptionTime', place: 'receptionPlace' }}
        values={values}
        onChange={onChange}
        dateSuggestion={sameAs(values.serviceDate, copy.sameDay, (receptionDate) => onChange({ receptionDate }))}
        placeSuggestion={sameAs(values.servicePlace, copy.samePlace, (receptionPlace) => onChange({ receptionPlace }))}
      />
      </Disclosure>
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
        <p id={`${id}-message-hint`}>{edited ? copy.messageHintEdited : copy.messageHint}</p>
        <textarea
          id={`${id}-message`}
          ref={messageRef}
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
            onClick={() => {
              onChange({ serviceMessage: undefined });
              // The button goes away on reset, so keep focus on the message.
              messageRef.current?.focus();
            }}
          >
            {copy.useDetails}
          </button>
        )}
      </div>
      <MarkReady
        ready={values.sectionStatus?.service === 'ready'}
        onChange={onReadyChange}
        nextSection={nextSection}
        onNext={onNext}
      />
    </div>
  );
}
