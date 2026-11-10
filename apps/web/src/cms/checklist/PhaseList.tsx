import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { screenCopy } from '@griever/copy';
import { computeChecklist } from '@griever/hooks';
import type {
  ChecklistFields,
  ChecklistItemId,
  ChecklistItemState,
} from '@griever/shared';
import { AccordionSection } from '../AccordionSection';
import { ChecklistItemRow } from './ChecklistItemRow';

const copy = screenCopy('cmsChecklist');
const GATHER_KEY = 'gather';
// Shown after Gather, in this order. The other phases come before Gather, in CHECKLIST_PHASES order.
// Display only: currentPhase and auto-open follow the time phases only (see computeChecklist).
const AFTER_GATHER: readonly string[] = ['obituary', 'planning-service'];

interface Props {
  checklist: ChecklistFields['checklist'];
  onOpen: (id: ChecklistItemId) => void;
  current?: ChecklistItemId | null;
  onChange: (id: ChecklistItemId, state: ChecklistItemState | null) => void;
  /** An extra section after the phases, in the same heading and accordion pattern. Starts closed. */
  gather?: ReactNode;
  /** A preview with nobody saved: no ticks. */
  readOnly?: boolean;
}

/** Every phase with its items: time phases, Gather, then the Obituary and Planning checklists. No counts, no percentages, no delete. */
export function PhaseList({
  checklist,
  onOpen,
  onChange,
  current,
  gather,
  readOnly = false,
}: Props) {
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
  const renderPhase = (phase: (typeof phases)[number]) => (
    <AccordionSection
      key={phase.key}
      title={copy.phases[phase.key]}
      open={open.has(phase.key)}
      panelId={`${panelId}-${phase.key}`}
      onToggle={() => toggle(phase.key)}
      done={phase.done}
      doneLabel={copy.done}
    >
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
            readOnly={readOnly}
          />
        ))}
      </ul>
    </AccordionSection>
  );
  return (
    <div className="flex flex-col gap-6">
      {phases
        .filter((phase) => !AFTER_GATHER.includes(phase.key))
        .map(renderPhase)}
      {gather && (
        <AccordionSection
          title={copy.gatherHeading}
          open={open.has(GATHER_KEY)}
          panelId={`${panelId}-${GATHER_KEY}`}
          onToggle={() => toggle(GATHER_KEY)}
        >
          {gather}
        </AccordionSection>
      )}
      {AFTER_GATHER.flatMap((key) =>
        phases.filter((phase) => phase.key === key),
      ).map(renderPhase)}
    </div>
  );
}
