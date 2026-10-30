import type { ReactNode } from 'react';
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
   * `detail` (default): two full buttons side by side.
   * `row`: a leading check-circle for Done, `children` (the row label), then a trailing chip.
   */
  variant?: 'detail' | 'row';
  children?: ReactNode;
}

/** Two toggles that exclude each other. Pressing the pressed one clears it. */
export function ItemStateToggles({ state, onChange, groupLabel, variant = 'detail', children }: Props) {
  const toggle = (next: ChecklistItemState) => {
    if (state === next) {
      onChange(null);
      return;
    }
    onChange(next);
  };

  if (variant === 'row') {
    return (
      <div role="group" aria-label={groupLabel} className="flex items-center gap-1">
        <button
          type="button"
          className="gg-chip size-11 shrink-0 rounded-full p-0 aria-pressed:shadow-none"
          aria-pressed={state === 'done'}
          aria-label={copy.done}
          onClick={() => toggle('done')}
        >
          {state === 'done' ? (
            <CheckCircle size={28} weight="fill" aria-hidden="true" className="text-accent-700" />
          ) : (
            <Circle size={28} weight="regular" aria-hidden="true" className="text-neutral-700" />
          )}
        </button>
        {children}
        <button
          type="button"
          className="gg-chip shrink-0"
          aria-pressed={state === 'not_applicable'}
          onClick={() => toggle('not_applicable')}
        >
          {copy.notApplicable}
        </button>
      </div>
    );
  }

  return (
    <div role="group" aria-label={groupLabel} className="flex flex-wrap gap-2">
      <button
        type="button"
        className={PRESSED}
        aria-pressed={state === 'done'}
        onClick={() => toggle('done')}
      >
        {state === 'done' && <Check size={18} weight="bold" aria-hidden="true" />}
        {copy.done}
      </button>
      <button
        type="button"
        className={PRESSED}
        aria-pressed={state === 'not_applicable'}
        onClick={() => toggle('not_applicable')}
      >
        {state === 'not_applicable' && <Check size={18} weight="bold" aria-hidden="true" />}
        {copy.notApplicable}
      </button>
    </div>
  );
}
