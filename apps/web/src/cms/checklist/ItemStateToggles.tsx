import { useId, type ReactNode } from 'react';
import { Check } from '@phosphor-icons/react/Check';
import { CheckCircle } from '@phosphor-icons/react/CheckCircle';
import { Circle } from '@phosphor-icons/react/Circle';
import { screenCopy } from '@griever/copy';
import type { ChecklistItemState } from '@griever/shared';

const copy = screenCopy('cmsChecklist');

// Pressed = tinted fill, darker double border and a check, so colour is never the only cue.
const PRESSED =
  'gg-btn gg-btn-secondary aria-pressed:border-accent-700 aria-pressed:bg-accent-100 aria-pressed:shadow-[inset_0_0_0_1px_var(--color-accent-700)]';

interface Props {
  state: ChecklistItemState | null;
  onChange: (state: ChecklistItemState | null) => void;
  /** Names the group for screen readers, so each row's toggles are told apart. */
  groupLabel: string;
  /**
   * `detail` (default): one full Done button.
   * `row`: a leading check-circle for Done, then `children` (the row label). No not-applicable button here.
   * A row saved as not_applicable shows as done-like: the circle is checked and pressing it clears the state.
   */
  variant?: 'detail' | 'row';
  /** Row variant: id of the label button. It names the group and describes the Done circle. */
  labelId?: string;
  children?: ReactNode;
}

/** A Done toggle. Pressing it again clears it. */
export function ItemStateToggles({ state, onChange, groupLabel, variant = 'detail', labelId, children }: Props) {
  const naNoteId = useId();

  if (variant === 'row') {
    const finished = state === 'done' || state === 'not_applicable';
    return (
      <div
        role="group"
        aria-label={labelId ? undefined : groupLabel}
        aria-labelledby={labelId}
        className="flex items-center gap-1"
      >
        <button
          type="button"
          className="gg-chip size-11 shrink-0 rounded-full p-0 aria-pressed:shadow-none"
          aria-pressed={finished}
          aria-label={copy.done}
          aria-describedby={state === 'not_applicable' ? [labelId, naNoteId].filter(Boolean).join(' ') : labelId}
          onClick={() => {
            if (finished) {
              onChange(null);
              return;
            }
            onChange('done');
          }}
        >
          {finished ? (
            <CheckCircle size={28} weight="fill" aria-hidden="true" className="text-accent-700" />
          ) : (
            <Circle size={28} weight="regular" aria-hidden="true" className="text-neutral-700" />
          )}
        </button>
        {state === 'not_applicable' && (
          <span id={naNoteId} className="sr-only">
            {copy.notApplicable}
          </span>
        )}
        {children}
      </div>
    );
  }

  // A saved not_applicable shows as done; pressing clears it.
  const finished = state === 'done' || state === 'not_applicable';
  return (
    <div role="group" aria-label={groupLabel} className="flex flex-wrap gap-2">
      <button
        type="button"
        className={PRESSED}
        aria-pressed={finished}
        aria-describedby={state === 'not_applicable' ? naNoteId : undefined}
        onClick={() => onChange(finished ? null : 'done')}
      >
        {finished && <Check size={18} weight="bold" aria-hidden="true" />}
        {copy.done}
      </button>
      {state === 'not_applicable' && (
        <span id={naNoteId} className="sr-only">
          {copy.notApplicable}
        </span>
      )}
    </div>
  );
}
