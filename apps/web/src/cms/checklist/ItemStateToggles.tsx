import { screenCopy } from '@griever/copy';
import type { ChecklistItemState } from '@griever/shared';

const copy = screenCopy('cmsChecklist');

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
        className="gg-btn gg-btn-secondary"
        aria-pressed={state === 'done'}
        onClick={() => toggle('done')}
      >
        {copy.done}
      </button>
      <button
        type="button"
        className="gg-btn gg-btn-secondary"
        aria-pressed={state === 'not_applicable'}
        onClick={() => toggle('not_applicable')}
      >
        {copy.notApplicable}
      </button>
    </div>
  );
}
