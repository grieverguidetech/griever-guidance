import { screenCopy } from '@griever/copy';
import type { ChecklistItemId, ChecklistItemState } from '@griever/shared';
import { ItemStateToggles } from './ItemStateToggles';

const copy = screenCopy('cmsChecklist');

interface Props {
  id: ChecklistItemId;
  state: ChecklistItemState | 'open';
  onOpen: (id: ChecklistItemId) => void;
  current?: boolean;
  onChange: (id: ChecklistItemId, state: ChecklistItemState | null) => void;
}

/**
 * One line: a check-circle for Done, the label (opens its guidance), then a small
 * not-applicable chip. A handled row (done or not applicable) shows its label muted.
 * aria-pressed carries the state; the muted colour is only a quiet extra cue.
 */
export function ChecklistItemRow({ id, state, onOpen, onChange, current }: Props) {
  const label = copy.items[id];
  const handled = state !== 'open';
  return (
    <li className="m-0">
      <ItemStateToggles
        variant="row"
        groupLabel={label}
        state={state === 'open' ? null : state}
        onChange={(next) => onChange(id, next)}
      >
        <button
          type="button"
          data-checklist-item={id}
          aria-current={current ? 'true' : undefined}
          className={`gg-btn gg-btn-ghost min-w-0 flex-1 text-left ${handled ? 'text-[color:var(--text-muted)]' : ''}`}
          onClick={() => onOpen(id)}
        >
          {label}
        </button>
      </ItemStateToggles>
    </li>
  );
}
