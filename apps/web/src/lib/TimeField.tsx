import type { ReactNode } from 'react';

/**
 * An accessible, low-effort time field, mirroring `DateField`. Uses the native
 * `<input type="time">` so each platform's own picker (mobile wheel, desktop
 * spinners + AM/PM, keyboard) and screen-reader support come for free. The
 * stored value stays a human-readable "2:00 PM" — that string goes straight
 * into the outgoing message — while the control speaks 24-hour "HH:MM".
 */

/** "2:00 PM" / "14:00" → "14:00"; "" if unparseable. */
export function timeToISO(pretty: string): string {
  const value = pretty?.trim();
  if (!value) return '';
  const match = value.match(/^(\d{1,2}):(\d{2})\s*([ap]\.?\s?m\.?)?$/i);
  if (!match) return '';
  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const meridiem = match[3]?.toLowerCase().replace(/[.\s]/g, '');
  if (meridiem === 'pm' && hours < 12) hours += 12;
  if (meridiem === 'am' && hours === 12) hours = 0;
  if (hours > 23 || minutes > 59) return '';
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

/** "14:00" → "2:00 PM"; "" if invalid. */
export function isoToTime(iso: string): string {
  const match = (iso ?? '').match(/^(\d{2}):(\d{2})$/);
  if (!match) return '';
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return '';
  return new Date(2000, 0, 1, hours, minutes).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
}

interface TimeInputProps {
  id: string;
  value: string;
  onChange: (pretty: string) => void;
  describedBy?: string;
  required?: boolean;
}

/** The bare control — pair it with your own `<label htmlFor>` / `.gg-field`. */
export function TimeInput({
  id,
  value,
  onChange,
  describedBy,
  required,
}: TimeInputProps) {
  return (
    <input
      id={id}
      type="time"
      className="gg-input gg-time"
      value={timeToISO(value)}
      required={required}
      aria-describedby={describedBy}
      onChange={(e) => onChange(isoToTime(e.target.value))}
      onClick={(e) => {
        const el = e.currentTarget as HTMLInputElement & { showPicker?: () => void };
        try {
          el.showPicker?.();
        } catch {
          // showPicker needs user activation on some browsers — a click qualifies,
          // but guard anyway so focusing the field never throws.
        }
      }}
    />
  );
}

interface TimeFieldProps extends Omit<TimeInputProps, 'describedBy'> {
  label: ReactNode;
  hint?: ReactNode;
}

/** Label + control + optional hint, wrapped in a `.gg-field`. */
export function TimeField({ id, label, hint, ...input }: TimeFieldProps) {
  const hintId = hint ? `${id}-hint` : undefined;
  return (
    <div className="gg-field">
      <label htmlFor={id}>{label}</label>
      <TimeInput id={id} describedBy={hintId} {...input} />
      {hint && (
        <p
          id={hintId}
          className="m-0 mt-1 text-[12px] leading-[1.5]"
          style={{ color: 'var(--text-hint)' }}
        >
          {hint}
        </p>
      )}
    </div>
  );
}
