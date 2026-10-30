import { useId, type ReactNode } from 'react';
import { screenCopy } from '@griever/copy';
import type { SectionFields, ServiceEventFields, SessionDetails } from '@griever/shared';
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
}

/** A slot can take the legend id, so its fields are named "legend label" like the base fields. */
type Slot = ReactNode | ((legendId: string) => ReactNode);

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
}: Props<K>) {
  const id = useId();
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
          value={values[keys.date] ?? ''}
          onChange={(v) => onChange({ [keys.date]: v } as Partial<Record<K, string>>)}
        />
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
      </div>
        </>
      )}
      {typeof extra === 'function' ? extra(legendId) : extra}
    </fieldset>
  );
}
