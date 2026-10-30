import { describe, expect, it } from 'vitest';
import { CHECKLIST_PHASES } from '@griever/shared';
import type {
  ChecklistFields,
  ChecklistItemId,
  ChecklistItemState,
} from '@griever/shared';
import { computeChecklist } from './checklistProgress.js';

function allWith(value: ChecklistItemState): ChecklistFields {
  const checklist: Partial<Record<ChecklistItemId, ChecklistItemState>> = {};
  for (const phase of CHECKLIST_PHASES) {
    for (const id of phase.itemIds) {
      checklist[id] = value;
    }
  }
  return { checklist };
}

describe('computeChecklist', () => {
  it('puts an empty state at phase 1 with its first item', () => {
    const result = computeChecklist({});
    expect(result.currentPhase).toBe('right-away');
    expect(result.nextItem).toBe('pronouncement');
    expect(result.phases).toHaveLength(CHECKLIST_PHASES.length);
    expect(result.phases.every((p) => !p.done)).toBe(true);
    expect(result.phases[0].items[0]).toEqual({
      id: 'pronouncement',
      state: 'open',
    });
  });

  it('moves to phase 2 when all of phase 1 is not_applicable', () => {
    const checklist: ChecklistFields['checklist'] = {};
    for (const id of CHECKLIST_PHASES[0].itemIds) {
      checklist[id] = 'not_applicable';
    }
    const result = computeChecklist({ checklist });
    expect(result.phases[0].done).toBe(true);
    expect(result.currentPhase).toBe('first-days');
    expect(result.nextItem).toBe('burial-or-cremation');
  });

  it('returns null phase and item when everything is done', () => {
    const result = computeChecklist(allWith('done'));
    expect(result.phases.every((p) => p.done)).toBe(true);
    expect(result.currentPhase).toBeNull();
    expect(result.nextItem).toBeNull();
  });

  it('counts a mix of done and not_applicable as all done', () => {
    const state = allWith('done');
    state.checklist = { ...state.checklist, headstone: 'not_applicable' };
    const result = computeChecklist(state);
    expect(result.currentPhase).toBeNull();
    expect(result.nextItem).toBeNull();
  });

  it('keeps currentPhase when an item in a later phase is ticked', () => {
    const before = computeChecklist({});
    const after = computeChecklist({ checklist: { headstone: 'done' } });
    expect(after.currentPhase).toBe(before.currentPhase);
    expect(after.nextItem).toBe(before.nextItem);
    const last = after.phases[after.phases.length - 1];
    expect(last.items.find((i) => i.id === 'headstone')?.state).toBe('done');
    expect(last.done).toBe(false);
  });

  it('picks the first open item when earlier items in the phase are done', () => {
    const result = computeChecklist({
      checklist: { pronouncement: 'done', custody: 'not_applicable' },
    });
    expect(result.currentPhase).toBe('right-away');
    expect(result.nextItem).toBe('find-wishes');
  });

  it('treats a bad stored value as open', () => {
    const state = allWith('done');
    state.checklist = { ...state.checklist, headstone: true as never };
    const result = computeChecklist(state);
    const last = result.phases[result.phases.length - 1];
    expect(last.items.find((i) => i.id === 'headstone')?.state).toBe('open');
    expect(last.done).toBe(false);
    expect(result.currentPhase).toBe('first-months');
    expect(result.nextItem).toBe('headstone');
  });

  it('has no numeric fields anywhere in the result', () => {
    const result = computeChecklist({
      checklist: { pronouncement: 'done' },
    });
    const numbers: string[] = [];
    const walk = (value: unknown, path: string): void => {
      if (typeof value === 'number') {
        numbers.push(path);
      } else if (Array.isArray(value)) {
        value.forEach((v, i) => walk(v, `${path}[${i}]`));
      } else if (value && typeof value === 'object') {
        for (const [k, v] of Object.entries(value)) {
          walk(v, `${path}.${k}`);
        }
      }
    };
    walk(result, 'result');
    expect(numbers).toEqual([]);
  });
});
