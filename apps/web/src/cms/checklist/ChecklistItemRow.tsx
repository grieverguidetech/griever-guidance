import { Check } from '@phosphor-icons/react/Check';
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

/** One item: the label opens its guidance, then the two state toggles. The check is decoration; aria-pressed carries the state. */
export function ChecklistItemRow({ id, state, onOpen, onChange, current }: Props) {
  const label = copy.items[id];
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <div className="flex min-w-0 flex-1 basis-56 flex-col">
        <div className="flex items-center gap-2">
          {state === 'done' && (
            <Check size={18} weight="bold" aria-hidden="true" className="shrink-0 text-success-700" />
          )}
          <button
            type="button"
            data-checklist-item={id}
            aria-current={current ? 'true' : undefined}
            className="gg-btn gg-btn-ghost min-w-0 text-left"
            onClick={() => onOpen(id)}
          >
            {label}
          </button>
        </div>
        {state === 'not_applicable' && (
          <span aria-hidden="true" className="text-[color:var(--text-muted)]">
            {copy.notApplicable}
          </span>
        )}
      </div>
      <ItemStateToggles
        groupLabel={label}
        state={state === 'open' ? null : state}
        onChange={(next) => onChange(id, next)}
      />
    </li>
  );
}
