import { useEffect, useId, useRef, useState } from 'react';
import { CaretDown } from '@phosphor-icons/react/CaretDown';
import { Check } from '@phosphor-icons/react/Check';
import { screenCopy } from '@griever/copy';
import { computeChecklist } from '@griever/hooks';
import type {
  ChecklistFields,
  ChecklistItemId,
  ChecklistItemState,
} from '@griever/shared';
import { ChecklistItemRow } from './ChecklistItemRow';

const copy = screenCopy('cmsChecklist');

interface Props {
  checklist: ChecklistFields['checklist'];
  onOpen: (id: ChecklistItemId) => void;
  current?: ChecklistItemId | null;
  onChange: (id: ChecklistItemId, state: ChecklistItemState | null) => void;
}

/** Every phase in order, with its items. No counts, no percentages, no delete. */
export function PhaseList({ checklist, onOpen, onChange, current }: Props) {
  const { phases, currentPhase } = computeChecklist({ checklist });
  // Open on load: the current phase only. Not remembered across loads.
  const [open, setOpen] = useState<Set<string>>(
    () => new Set(currentPhase ? [currentPhase] : []),
  );
  const panelId = useId();
  // When the current phase moves on (its last item handled), open the new one.
  // The finished phase stays as the user left it, and focus does not move.
  const lastCurrent = useRef(currentPhase);
  useEffect(() => {
    if (currentPhase && currentPhase !== lastCurrent.current) {
      setOpen((before) => new Set(before).add(currentPhase));
    }
    lastCurrent.current = currentPhase;
  }, [currentPhase]);
  const toggle = (key: string) => {
    setOpen((before) => {
      const next = new Set(before);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };
  return (
    <div className="flex flex-col gap-6">
      {phases.map((phase) => (
        <section key={phase.key} className="flex flex-col gap-3">
          <h3 className="m-0">
            <button
              type="button"
              className="flex min-h-11 w-full items-center gap-2 text-left"
              aria-expanded={open.has(phase.key)}
              aria-controls={`${panelId}-${phase.key}`}
              onClick={() => toggle(phase.key)}
            >
              <CaretDown
                size={16}
                weight="bold"
                aria-hidden="true"
                data-chevron
                className={`order-last ml-auto shrink-0 motion-safe:transition-transform ${open.has(phase.key) ? 'rotate-180' : ''}`}
              />
              {copy.phases[phase.key]}
              {phase.done && (
                <>
                  {' '}
                  <Check
                    size={20}
                    weight="bold"
                    aria-hidden="true"
                    className="shrink-0 text-success-700"
                  />
                  <span className="sr-only">{copy.done}</span>
                </>
              )}
            </button>
          </h3>
          <div id={`${panelId}-${phase.key}`} hidden={!open.has(phase.key)}>
            <div className="flex flex-col gap-3">
              {phase.key === 'obituary' && <p>{copy.obituaryNote}</p>}
              <ul className="flex list-none flex-col gap-3 p-0">
                {phase.items.map((item) => (
                  <ChecklistItemRow
                    key={item.id}
                    id={item.id}
                    state={item.state}
                    onOpen={onOpen}
                    current={item.id === current}
                    onChange={onChange}
                  />
                ))}
              </ul>
            </div>
          </div>
        </section>
      ))}
    </div>
  );
}
