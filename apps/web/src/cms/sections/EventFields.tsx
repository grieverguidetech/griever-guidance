import { useId, type ReactNode } from 'react';
import { screenCopy } from '@griever/copy';
import { dateNote, type SectionFields, type ServiceEventFields, type SessionDetails } from '@griever/shared';
import { DateInput } from '../../lib/DateField';
import { TimeInput } from '../../lib/TimeField';

/** Only real text keys of the session, so a typo in `keys` fails to compile. */
export type EventKey = {
  [P in keyof (SessionDetails & SectionFields & ServiceEventFields)]-?: (SessionDetails &
    SectionFields &
    ServiceEventFields)[P] extends string | undefined
    ? P
    : never;
}[keyof (SessionDetails & SectionFields & ServiceEventFields)] &
  string;

const copy = screenCopy('cmsService');

/** The session keys one event writes to, one key each for date, time and place. */
export interface EventKeys<K extends EventKey = EventKey> {
  date: K;
  time: K;
  place: K;
}

interface Props<K extends EventKey> {
  /** Names the group for a screen reader, the event name. */
  legend: string;
  keys: EventKeys<K>;
  values: Partial<Record<K, string>>;
  /** Gets only the key that changed. */
  onChange: (patch: Partial<Record<K, string>>) => void;
  /** Label for the place field when the default does not fit. */
  placeLabel?: string;
  /** Controls right after the legend, before date: a checkbox, a type. */
  lead?: Slot;
  /** Extra controls after the place field: address, officiant. */
  extra?: Slot;
  /** Hides date, time and place. The lead and extra slots stay. */
  hideFields?: boolean;
  /** A one-tap fill for an empty date. Shown only while the date is empty; never fills by itself. */
  dateSuggestion?: Suggestion;
  /** The same for an empty place. */
  placeSuggestion?: Suggestion;
  /** The date of passing as typed. A date before it gets a quiet note. */
  dateOfPassing?: string | null;
}

/** A button label and what to do on tap. The parent writes the value. */
export interface Suggestion {
  label: string;
  onUse: () => void;
}

/** A slot can take the legend id, so its fields are named "legend label" like the base fields. */
type Slot = ReactNode | ((legendId: string) => ReactNode);

/** A small button named "legend label", like the fields. It goes away once the field has a value, so focus moves to the field. */
function SuggestionButton({
  suggestion,
  legendId,
  buttonId,
  fieldId,
}: {
  suggestion: Suggestion;
  legendId: string;
  buttonId: string;
  fieldId: string;
}) {
  return (
    <button
      type="button"
      id={buttonId}
      aria-labelledby={`${legendId} ${buttonId}`}
      className="gg-btn gg-btn-secondary min-h-[44px] self-start"
      onClick={() => {
        suggestion.onUse();
        document.getElementById(fieldId)?.focus();
      }}
    >
      {suggestion.label}
    </button>
  );
}

/** Date, time and where, for one event. There is no delete control. */
export function EventFields<K extends EventKey>({
  legend,
  keys,
  values,
  onChange,
  placeLabel = copy.placeLabel,
  lead,
  extra,
  hideFields = false,
  dateSuggestion,
  placeSuggestion,
  dateOfPassing,
}: Props<K>) {
  const id = useId();
  const kind = dateNote(values[keys.date], { field: 'event', dateOfPassing });
  const note = kind === 'unreadable' ? copy.dateUnreadable : kind === 'beforePassing' ? copy.beforePassing : undefined;
  const legendId = `${id}-legend`;
  return (
    <fieldset tabIndex={-1} className="flex flex-col gap-4 border-0 p-0 m-0 min-w-0">
      <legend id={legendId} className="mb-2 p-0 font-semibold">{legend}</legend>
      {typeof lead === 'function' ? lead(legendId) : lead}
      {!hideFields && (
        <>
      <div className="gg-field">
        <label id={`${id}-date-label`} htmlFor={`${id}-date`}>
          {copy.dateLabel}
        </label>
        <DateInput
          id={`${id}-date`}
          labelledBy={`${legendId} ${id}-date-label`}
          visibleHelp
          note={note}
          value={values[keys.date] ?? ''}
          onChange={(v) => onChange({ [keys.date]: v } as Partial<Record<K, string>>)}
        />
        {dateSuggestion && !values[keys.date] && (
          <SuggestionButton
            suggestion={dateSuggestion}
            legendId={legendId}
            buttonId={`${id}-date-suggest`}
            fieldId={`${id}-date`}
          />
        )}
      </div>
      <div className="gg-field">
        <label id={`${id}-time-label`} htmlFor={`${id}-time`}>
          {copy.timeLabel}
        </label>
        <TimeInput
          id={`${id}-time`}
          labelledBy={`${legendId} ${id}-time-label`}
          value={values[keys.time] ?? ''}
          onChange={(v) => onChange({ [keys.time]: v } as Partial<Record<K, string>>)}
        />
      </div>
      <div className="gg-field">
        <label id={`${id}-place-label`} htmlFor={`${id}-place`}>
          {placeLabel}
        </label>
        <input
          id={`${id}-place`}
          aria-labelledby={`${legendId} ${id}-place-label`}
          type="text"
          className="gg-input"
          autoComplete="off"
          value={values[keys.place] ?? ''}
          onChange={(e) => onChange({ [keys.place]: e.target.value } as Partial<Record<K, string>>)}
        />
        {placeSuggestion && !values[keys.place] && (
          <SuggestionButton
            suggestion={placeSuggestion}
            legendId={legendId}
            buttonId={`${id}-place-suggest`}
            fieldId={`${id}-place`}
          />
        )}
      </div>
        </>
      )}
      {typeof extra === 'function' ? extra(legendId) : extra}
    </fieldset>
  );
}
