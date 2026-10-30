import { Check } from '@phosphor-icons/react/Check';
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
}

/** Two toggles that exclude each other. Pressing the pressed one clears it. */
export function ItemStateToggles({ state, onChange, groupLabel }: Props) {
  const toggle = (next: ChecklistItemState) => {
    if (state === next) {
      onChange(null);
      return;
    }
    onChange(next);
  };

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
