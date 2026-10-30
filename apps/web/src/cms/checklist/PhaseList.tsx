import { Check } from '@phosphor-icons/react/Check';
import { screenCopy } from '@griever/copy';
import { computeChecklist } from '@griever/hooks';
import type { ChecklistFields, ChecklistItemId, ChecklistItemState } from '@griever/shared';
import { ChecklistItemRow } from './ChecklistItemRow';

const copy = screenCopy('cmsChecklist');

interface Props {
  checklist: ChecklistFields['checklist'];
  onOpen: (id: ChecklistItemId) => void;
  onChange: (id: ChecklistItemId, state: ChecklistItemState | null) => void;
}

/** Every phase in order, with its items. No counts, no percentages, no delete. */
export function PhaseList({ checklist, onOpen, onChange }: Props) {
  const { phases } = computeChecklist({ checklist });
  return (
    <div className="flex flex-col gap-6">
      {phases.map((phase) => (
        <section key={phase.key} className="flex flex-col gap-3">
          <h2 className="flex items-center gap-2">
            {copy.phases[phase.key]}
            {phase.done && (
              <>
                <Check size={20} weight="bold" aria-hidden="true" className="shrink-0 text-success-700" />
                <span className="sr-only">{copy.done}</span>
              </>
            )}
          </h2>
          {phase.key === 'obituary' && <p>{copy.obituaryNote}</p>}
          <ul className="flex list-none flex-col gap-3 p-0">
            {phase.items.map((item) => (
              <ChecklistItemRow
                key={item.id}
                id={item.id}
                state={item.state}
                onOpen={onOpen}
                onChange={onChange}
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
