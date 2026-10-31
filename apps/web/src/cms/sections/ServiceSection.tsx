import { useEffect, useId, useRef, useState, type MouseEvent } from 'react';
import { Plus } from '@phosphor-icons/react/Plus';
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
  Pick<SessionDetails, 'personName' | 'serviceDate' | 'obituaryUrl' | 'dateOfPassing'> &
    Omit<SectionFields, 'sectionStatus'> &
    ServiceEventFields
> &
  Pick<SectionFields, 'sectionStatus'>;

export type ServicePatch = Partial<Omit<ServiceValues, 'sectionStatus' | 'personName' | 'obituaryUrl' | 'dateOfPassing'>>;

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
  const changeRef = useRef<HTMLButtonElement>(null);
  const previewRef = useRef<HTMLElement>(null);
  // The textarea only shows while the family changes the words; otherwise the preview does.
  const [editing, setEditing] = useState(false);
  // Each request bumps the counter, so focus moves even when `editing` does not change.
  const [focusRequest, setFocusRequest] = useState<{ n: number; to: 'textarea' | 'change' } | null>(null);
  const requestFocus = (to: 'textarea' | 'change') => setFocusRequest((r) => ({ n: (r?.n ?? 0) + 1, to }));
  useEffect(() => {
    if (focusRequest?.to === 'textarea') {
      messageRef.current?.focus();
    } else if (focusRequest?.to === 'change') {
      changeRef.current?.focus();
    }
  }, [focusRequest]);
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
  // Focus goes to the fieldset of the group just opened (named by its legend), not an input, so the
  // phone keyboard does not open. The Add chip is gone by then.
  const focusGroup = useRef<keyof typeof opened | null>(null);
  const panelsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (focusGroup.current) {
      panelsRef.current?.querySelector<HTMLElement>(`[data-group="${focusGroup.current}"] fieldset`)?.focus();
      focusGroup.current = null;
    }
  }, [opened]);
  // One way: a chip opens its group and never closes it, so nothing the family typed is hidden.
  const openGroup = (g: keyof typeof opened) => {
    focusGroup.current = g;
    setOpened((o) => ({ ...o, [g]: true }));
  };
  const chips = [
    { key: 'visitation', label: copy.addVisitation },
    { key: 'burial', label: copy.addBurial },
    { key: 'reception', label: copy.addReception },
  ] as const;
  const closed = chips.filter((c) => !open[c.key]);
  const panel = 'gg-panel gg-enter';
  const messageText = (values.serviceMessage ?? prefill).trim();
  const previewId = `${id}-preview`;
  const hintId = `${id}-message-hint`;
  const seeMessage = (e: MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    const smooth =
      typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: no-preference)').matches;
    previewRef.current?.scrollIntoView?.({ behavior: smooth ? 'smooth' : 'auto', block: 'start' });
    previewRef.current?.focus({ preventScroll: true });
  };
  const useDetails = () => {
    onChange({ serviceMessage: undefined });
    requestFocus('change');
    setEditing(false);
  };

  return (
    <div className="flex flex-col gap-6">
      <p>{copy.intro}</p>
      <a href={`#${previewId}`} className="gg-btn gg-btn-secondary md:hidden self-start" onClick={seeMessage}>
        {copy.seeMessage}
      </a>
      <div className="gg-panel">
        <EventFields
          legend={copy.eventFuneral}
          keys={{ date: 'serviceDate', time: 'serviceTime', place: 'servicePlace' }}
          values={values}
          onChange={onChange}
          dateOfPassing={values.dateOfPassing}
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
      </div>
      {closed.length > 0 && (
        <div className="flex flex-col gap-1">
          <p className="gg-hint">{copy.alsoHaving}</p>
          <div className="flex flex-wrap gap-2">
            {closed.map((c) => (
              <button key={c.key} type="button" className="gg-chip min-h-[44px] text-accent-700" onClick={() => openGroup(c.key)}>
                <Plus aria-hidden="true" weight="bold" size={16} data-testid="add-icon" />
                {c.label}
              </button>
            ))}
          </div>
        </div>
      )}
      <div ref={panelsRef} className="flex flex-col gap-6">
        {open.visitation && (
          <div className={panel} data-group="visitation">
            <EventFields
              legend={copy.eventVisitation}
              keys={{ date: 'visitationDate', time: 'visitationTime', place: 'visitationPlace' }}
              values={values}
              onChange={onChange}
              dateOfPassing={values.dateOfPassing}
              dateSuggestion={sameAs(values.serviceDate, copy.sameDay, (visitationDate) => onChange({ visitationDate }))}
              placeSuggestion={sameAs(values.servicePlace, copy.samePlace, (visitationPlace) => onChange({ visitationPlace }))}
            />
          </div>
        )}
        {open.burial && (
          <div className={panel} data-group="burial">
            <EventFields
              legend={copy.eventBurial}
              keys={{ date: 'burialDate', time: 'burialTime', place: 'burialPlace' }}
              values={values}
              onChange={onChange}
              dateOfPassing={values.dateOfPassing}
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
          </div>
        )}
        {open.reception && (
          <div className={panel} data-group="reception">
            <EventFields
              legend={copy.eventReception}
              keys={{ date: 'receptionDate', time: 'receptionTime', place: 'receptionPlace' }}
              values={values}
              onChange={onChange}
              dateOfPassing={values.dateOfPassing}
              dateSuggestion={sameAs(values.serviceDate, copy.sameDay, (receptionDate) => onChange({ receptionDate }))}
              placeSuggestion={sameAs(values.servicePlace, copy.samePlace, (receptionPlace) => onChange({ receptionPlace }))}
            />
          </div>
        )}
      </div>
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
      <section id={previewId} ref={previewRef} tabIndex={-1} aria-labelledby={`${id}-preview-title`} className="gg-panel flex flex-col gap-3 scroll-mt-4">
        <h2 id={`${id}-preview-title`} className="text-base font-semibold">
          {copy.previewTitle}
        </h2>
        {editing ? (
          <div className="gg-field">
            <label htmlFor={`${id}-message`}>{copy.messageLabel}</label>
            <textarea
              id={`${id}-message`}
              ref={messageRef}
              aria-describedby={hintId}
              className="gg-input"
              rows={8}
              value={values.serviceMessage ?? prefill}
              onChange={(e) => onChange({ serviceMessage: e.target.value })}
            />
          </div>
        ) : messageText ? (
          <p className="font-serif text-lg leading-relaxed whitespace-pre-line">{messageText}</p>
        ) : (
          <p className="gg-hint">{copy.previewEmpty}</p>
        )}
        <p id={hintId} className="gg-hint">
          {edited ? copy.messageHintEdited : copy.messageHint}
        </p>
        <div className="flex flex-wrap gap-2">
          {!editing && (
            <button
              type="button"
              ref={changeRef}
              className="gg-btn gg-btn-secondary"
              onClick={() => {
                requestFocus('textarea');
                setEditing(true);
              }}
            >
              {copy.changeWords}
            </button>
          )}
          {editing && (
            <button
              type="button"
              className="gg-btn gg-btn-secondary"
              onClick={() => {
                requestFocus('change');
                setEditing(false);
              }}
            >
              {copy.doneEditing}
            </button>
          )}
          {edited && (
            <button type="button" className="gg-btn gg-btn-secondary" onClick={useDetails}>
              {copy.useDetails}
            </button>
          )}
        </div>
      </section>
      <MarkReady
        ready={values.sectionStatus?.service === 'ready'}
        onChange={onReadyChange}
        nextSection={nextSection}
        onNext={onNext}
      />
    </div>
  );
}
