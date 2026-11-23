import { describe, expect, it } from 'vitest';
import { screenCopy } from '@griever/copy';
import {
  CHECKLIST_PHASES,
  TIME_PHASE_KEYS,
  computeChecklist,
} from '@griever/shared';
import type { ChecklistItemId, Situation } from '@griever/shared';
import { nextStep, startWorkflow } from './workflow.js';

const undecided: Situation = { disposition: 'undecided' };

const timeIds: ChecklistItemId[] = CHECKLIST_PHASES.filter((p) =>
  TIME_PHASE_KEYS.includes(p.key),
).flatMap((p) => [...p.itemIds]);

const listIds: ChecklistItemId[] = CHECKLIST_PHASES.filter(
  (p) => !TIME_PHASE_KEYS.includes(p.key),
).flatMap((p) => [...p.itemIds]);

/** Walk the whole list the way the assistant would. */
function walk(situation: Situation): ChecklistItemId[] {
  const done: ChecklistItemId[] = [];
  for (let i = 0; i < 60; i += 1) {
    const { next } = nextStep(situation, done);
    if (!next) {
      return done;
    }
    done.push(next.id);
  }
  throw new Error('Walk did not finish');
}

describe('startWorkflow', () => {
  it('lists the time-phase steps in order', () => {
    expect(startWorkflow(undecided).steps.map((s) => s.id)).toEqual(timeIds);
  });

  it('keeps the C10 milestones in order', () => {
    const ids = startWorkflow(undecided).steps.map((s) => s.id);
    const at = (id: ChecklistItemId) => ids.indexOf(id);
    expect(at('pronouncement')).toBeLessThan(at('custody'));
    expect(at('custody')).toBeLessThan(at('burial-or-cremation'));
    expect(at('burial-or-cremation')).toBeLessThan(at('set-service'));
  });

  it('lists the obituary and planning lists apart, with the obituary note', () => {
    const result = startWorkflow(undecided);
    const listed = [...result.obituarySteps, ...result.planningServiceSteps];
    expect(listed.map((s) => s.id).sort()).toEqual([...listIds].sort());
    expect(result.steps.some((s) => listIds.includes(s.id))).toBe(false);
    expect(result.obituaryNote).toBe(screenCopy('cmsChecklist').obituaryNote);
  });

  it('gives the first step in full and the quote-exactly instruction', () => {
    const result = startWorkflow(undecided);
    expect(result.first?.id).toBe('pronouncement');
    expect(result.first?.whatItIs.length).toBeGreaterThan(0);
    expect(result.instruction).toBe(screenCopy('agentWorkflow').agentInstruction);
  });
});

describe('nextStep', () => {
  it('equals computeChecklist().nextItem for every prefix of done ids', () => {
    for (let n = 0; n <= timeIds.length; n += 1) {
      const done = timeIds.slice(0, n);
      const checklist = Object.fromEntries(done.map((id) => [id, 'done' as const]));
      expect(nextStep(undecided, done).next?.id ?? null).toBe(
        computeChecklist({ checklist }).nextItem,
      );
    }
  });

  it('never returns an obituary or planning-service item', () => {
    const walked = walk(undecided);
    expect(walked.some((id) => listIds.includes(id))).toBe(false);
    expect(walked).toHaveLength(timeIds.length);
  });

  it('skips burial-or-cremation when the family chose, not when undecided', () => {
    expect(walk({ disposition: 'burial' })).not.toContain('burial-or-cremation');
    expect(walk({ disposition: 'cremation' })).not.toContain('burial-or-cremation');
    expect(walk(undecided)).toContain('burial-or-cremation');
  });

  it('gives the same answer for duplicate done ids', () => {
    expect(nextStep(undecided, ['pronouncement', 'pronouncement'])).toEqual(
      nextStep(undecided, ['pronouncement']),
    );
  });

  it('ignores ids it does not know', () => {
    expect(nextStep(undecided, ['nope'])).toEqual(nextStep(undecided, []));
  });

  it('returns null and the all-done line when nothing is left', () => {
    const result = nextStep(undecided, timeIds);
    expect(result.next).toBeNull();
    expect(result.phase).toBeNull();
    expect(result.message).toBe(screenCopy('agentWorkflow').allDone);
  });

  it('returns the phase of the next step and the what-done-means line', () => {
    const result = nextStep(undecided, ['pronouncement']);
    expect(result.phase).toBe(result.next?.phase);
    expect(result.message).toBe(screenCopy('agentWorkflow').whatDoneMeans);
  });
});
