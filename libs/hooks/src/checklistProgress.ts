import {
  CHECKLIST_PHASES,
  type ChecklistFields,
  type ChecklistItemState,
  type ChecklistItemId,
  type ChecklistPhaseKey,
} from '@griever/shared';

export type ChecklistProgressItemState = ChecklistItemState | 'open';

export interface ChecklistProgressItem {
  id: ChecklistItemId;
  state: ChecklistProgressItemState;
}

export interface ChecklistProgressPhase {
  key: ChecklistPhaseKey;
  done: boolean;
  items: ChecklistProgressItem[];
}

export interface ChecklistProgress {
  phases: ChecklistProgressPhase[];
  currentPhase: ChecklistPhaseKey | null;
  nextItem: ChecklistItemId | null;
}

/**
 * Works out the current phase and next open item. Phases are not locked:
 * an item ticked in a later phase does not move currentPhase until every
 * earlier phase is done. Returns no counts or percentages (C10).
 */
export function computeChecklist(state: ChecklistFields): ChecklistProgress {
  const saved = state.checklist ?? {};

  const phases: ChecklistProgressPhase[] = CHECKLIST_PHASES.map((phase) => {
    const items = phase.itemIds.map((id): ChecklistProgressItem => {
      const value = saved[id];
      if (value === 'done' || value === 'not_applicable') {
        return { id, state: value };
      }
      return { id, state: 'open' };
    });
    const done = items.every((item) => item.state !== 'open');
    return { key: phase.key, done, items };
  });

  const current = phases.find((phase) => !phase.done);
  const next = current?.items.find((item) => item.state === 'open');

  return {
    phases,
    currentPhase: current?.key ?? null,
    nextItem: next?.id ?? null,
  };
}
