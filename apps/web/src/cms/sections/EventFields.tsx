import { useId, type ReactNode } from 'react';
import { screenCopy } from '@griever/copy';
import { DateField } from '../../lib/DateField';
import { TimeInput } from '../../lib/TimeField';

const copy = screenCopy('cmsService');

/** The session keys one event writes to, one key each for date, time and place. */
export interface EventKeys<K extends string = string> {
  date: K;
  time: K;
  place: K;
}

interface Props<K extends string> {
  /** Names the group for a screen reader, the event name. */
  legend: string;
  keys: EventKeys<K>;
  values: Partial<Record<K, string>>;
  /** Gets only the key that changed. */
  onChange: (patch: Partial<Record<K, string>>) => void;
  /** Label for the place field when the default does not fit. */
  placeLabel?: string;
  /** Extra controls after the place field: address, officiant, a checkbox. */
  extra?: ReactNode;
}

/** Date, time and where, for one event. There is no delete control. */
export function EventFields<K extends string>({
  legend,
  keys,
  values,
  onChange,
  placeLabel = copy.placeLabel,
  extra,
}: Props<K>) {
  const id = useId();
  return (
    <fieldset className="flex flex-col gap-4 border-0 p-0 m-0 min-w-0">
      <legend className="mb-2 p-0 font-semibold">{legend}</legend>
      <DateField
        id={`${id}-date`}
        label={copy.dateLabel}
        value={values[keys.date] ?? ''}
        onChange={(v) => onChange({ [keys.date]: v } as Partial<Record<K, string>>)}
      />
      <div className="gg-field">
        <label htmlFor={`${id}-time`}>{copy.timeLabel}</label>
        <TimeInput
          id={`${id}-time`}
          value={values[keys.time] ?? ''}
          onChange={(v) => onChange({ [keys.time]: v } as Partial<Record<K, string>>)}
        />
      </div>
      <div className="gg-field">
        <label htmlFor={`${id}-place`}>{placeLabel}</label>
        <input
          id={`${id}-place`}
          type="text"
          className="gg-input"
          autoComplete="off"
          value={values[keys.place] ?? ''}
          onChange={(e) => onChange({ [keys.place]: e.target.value } as Partial<Record<K, string>>)}
        />
      </div>
      {extra}
    </fieldset>
  );
}
