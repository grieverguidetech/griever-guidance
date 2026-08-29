import { useRef, type ReactNode } from 'react';
import { CalendarBlank } from '@phosphor-icons/react';

/**
 * An accessible, low-effort date field. The user can **type** a date freely
 * ("May 29, 2026", "5/29/2026") in the visible text box, or press the calendar
 * button to pick one from the platform's native date picker (mobile wheel,
 * desktop calendar). The stored value stays a human-readable string — that
 * string goes straight into the outgoing message — and is tidied to
 * "Month D, YYYY" on blur whenever it parses.
 */

/** "May 29, 2026" (or any parseable date) → "2026-05-29"; "" if unparseable. */
export function dateToISO(pretty: string): string {
  const value = pretty?.trim();
  if (!value) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  const y = parsed.getFullYear();
  const m = String(parsed.getMonth() + 1).padStart(2, '0');
  const d = String(parsed.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** "2026-05-29" → "May 29, 2026" (local, no timezone drift); "" if invalid. */
export function isoToDate(iso: string): string {
  const [y, m, d] = (iso ?? '').split('-').map(Number);
  if (!y || !m || !d) return '';
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

interface DateInputProps {
  id: string;
  value: string;
  onChange: (pretty: string) => void;
  min?: string;
  max?: string;
  describedBy?: string;
  required?: boolean;
}

/** The bare control — pair it with your own `<label htmlFor>` / `.gg-field`. */
export function DateInput({
  id,
  value,
  onChange,
  min,
  max,
  describedBy,
  required,
}: DateInputProps) {
  const pickerRef = useRef<HTMLInputElement>(null);
  const helpId = `${id}-help`;

  function openPicker() {
    const el = pickerRef.current as
      | (HTMLInputElement & { showPicker?: () => void })
      | null;
    if (!el) return;
    try {
      el.showPicker?.();
    } catch {
      // Older Safari has no showPicker(); focusing a date input opens the
      // native picker on iOS.
      el.focus();
    }
  }

  return (
    <div className="gg-datebox">
      <input
        id={id}
        type="text"
        inputMode="text"
        autoComplete="off"
        spellCheck={false}
        className="gg-input gg-datebox-text"
        placeholder="e.g. May 29, 2026"
        value={value}
        aria-required={required || undefined}
        aria-describedby={[describedBy, helpId].filter(Boolean).join(' ')}
        onChange={(e) => onChange(e.target.value)}
        onBlur={(e) => {
          const iso = dateToISO(e.target.value);
          if (iso) onChange(isoToDate(iso));
        }}
      />
      <button
        type="button"
        className="gg-datebox-trigger"
        aria-label="Choose date from calendar"
        onClick={openPicker}
      >
        <CalendarBlank size={18} weight="duotone" aria-hidden="true" />
      </button>
      <input
        ref={pickerRef}
        type="date"
        className="gg-datebox-native"
        tabIndex={-1}
        aria-hidden="true"
        value={dateToISO(value)}
        min={min}
        max={max}
        onChange={(e) => onChange(isoToDate(e.target.value))}
      />
      <span id={helpId} className="sr-only">
        Type a date such as May 29, 2026, or use the calendar button.
      </span>
    </div>
  );
}

interface DateFieldProps extends Omit<DateInputProps, 'describedBy'> {
  label: ReactNode;
  hint?: ReactNode;
}

/** Label + control + optional hint, wrapped in a `.gg-field`. */
export function DateField({ id, label, hint, ...input }: DateFieldProps) {
  const hintId = hint ? `${id}-hint` : undefined;
  return (
    <div className="gg-field">
      <label htmlFor={id}>{label}</label>
      <DateInput id={id} describedBy={hintId} {...input} />
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

/** Today as an ISO date, for `min`/`max` bounds. */
export function todayISO(): string {
  const now = new Date();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${m}-${d}`;
}
