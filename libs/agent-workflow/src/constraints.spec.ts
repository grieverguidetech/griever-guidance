import { describe, expect, it } from 'vitest';
import { screenCopy } from '@griever/copy';
import { CHECKLIST_PHASES, DISPOSITIONS } from '@griever/shared';
import type { ChecklistItemId } from '@griever/shared';
import { STEP_ACTORS } from './actors.js';
import { nextStep, startWorkflow } from './workflow.js';

const allIds: ChecklistItemId[] = CHECKLIST_PHASES.flatMap((p) => [...p.itemIds]);
const FORBIDDEN = ['!', 'sms:', 'mailto:', 'tel:', 'http'];

describe('STEP_ACTORS', () => {
  it('has every checklist id and nothing else', () => {
    expect(allIds).toHaveLength(37);
    expect(Object.keys(STEP_ACTORS).sort()).toEqual([...allIds].sort());
  });

  it('is you for every step in Phase 1', () => {
    expect(new Set(Object.values(STEP_ACTORS))).toEqual(new Set(['you']));
  });
});

describe('hand-off line', () => {
  it('is on tell-close-family and on no other step', () => {
    const situation = { disposition: 'undecided' as const };
    const withHandOff: string[] = [];
    const done: string[] = [];
    for (let i = 0; i < 40; i += 1) {
      const { next } = nextStep(situation, done);
      if (!next) {
        break;
      }
      if (next.handOff) {
        expect(next.handOff).toBe(screenCopy('agentWorkflow').handOff);
        withHandOff.push(next.id);
      }
      done.push(next.id);
    }
    expect(withHandOff).toEqual(['tell-close-family']);
  });
});

describe('output text', () => {
  it('has no exclamation mark and no link, for every step and disposition', () => {
    for (const disposition of DISPOSITIONS) {
      const situation = { disposition };
      const outputs: unknown[] = [startWorkflow(situation)];
      const done: string[] = [];
      for (let i = 0; i < 40; i += 1) {
        const result = nextStep(situation, done);
        outputs.push(result);
        if (!result.next) {
          break;
        }
        done.push(result.next.id);
      }
      const text = JSON.stringify(outputs);
      for (const bad of FORBIDDEN) {
        expect(text).not.toContain(bad);
      }
    }
  });
});
