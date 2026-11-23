import { checklistDetail, screenCopy } from '@griever/copy';
import {
  CHECKLIST_PHASES,
  TIME_PHASE_KEYS,
  computeChecklist,
} from '@griever/shared';
import type {
  ChecklistFields,
  ChecklistItemId,
  ChecklistItemState,
  ChecklistPhaseKey,
  NextStepResult,
  Situation,
  StartWorkflowResult,
  WorkflowListItem,
  WorkflowStep,
  WorkflowStepSummary,
} from '@griever/shared';
import { STEP_ACTORS } from './actors.js';

const HAND_OFF_STEP: ChecklistItemId = 'tell-close-family';

function itemTitle(id: ChecklistItemId): string {
  return screenCopy('cmsChecklist').items[id];
}

function phaseOf(id: ChecklistItemId): ChecklistPhaseKey {
  const phase = CHECKLIST_PHASES.find((p) =>
    (p.itemIds as readonly string[]).includes(id),
  );
  if (!phase) {
    throw new Error(`Unknown checklist item "${id}"`);
  }
  return phase.key;
}

/** The full text of one step. Detail text comes from libs/copy; sources are left out. */
function buildStep(id: ChecklistItemId): WorkflowStep {
  const detail = checklistDetail(id);
  const step: WorkflowStep = {
    id,
    phase: phaseOf(id),
    title: itemTitle(id),
    actor: STEP_ACTORS[id],
    whatItIs: detail?.whatItIs ?? screenCopy('cmsChecklist').comingSoon,
    whyItMatters: detail?.whyItMatters ?? screenCopy('cmsChecklist').comingSoon,
  };
  if (detail?.whoToCall) {
    step.whoToCall = detail.whoToCall;
  }
  if (detail?.whatToBring) {
    step.whatToBring = detail.whatToBring;
  }
  if (detail?.doesNotApplyWhen) {
    step.doesNotApplyWhen = detail.doesNotApplyWhen;
  }
  if (id === HAND_OFF_STEP) {
    step.handOff = screenCopy('agentWorkflow').handOff;
  }
  return step;
}

/** Burial or cremation settles that choice. Undecided leaves it open. */
function stateFor(situation: Situation, done: readonly string[]): ChecklistFields {
  const checklist: Partial<Record<ChecklistItemId, ChecklistItemState>> = {};
  const known = new Set<string>(CHECKLIST_PHASES.flatMap((p) => p.itemIds));
  for (const id of new Set(done)) {
    if (known.has(id)) {
      checklist[id as ChecklistItemId] = 'done';
    }
  }
  if (situation.disposition !== 'undecided') {
    checklist['burial-or-cremation'] = 'done';
  }
  return { checklist };
}

function listFor(phaseKey: ChecklistPhaseKey): WorkflowListItem[] {
  const phase = CHECKLIST_PHASES.find((p) => p.key === phaseKey);
  return (phase?.itemIds ?? []).map((id) => ({ id, title: itemTitle(id) }));
}

function timeSteps(): WorkflowStepSummary[] {
  return CHECKLIST_PHASES.filter((p) => TIME_PHASE_KEYS.includes(p.key)).flatMap(
    (p) =>
      p.itemIds.map((id) => ({
        id,
        phase: p.key,
        title: itemTitle(id),
        actor: STEP_ACTORS[id],
      })),
  );
}

/** The next open step, or null with the all-done line. Remembers nothing between calls. */
export function nextStep(situation: Situation, done: readonly string[]): NextStepResult {
  const copy = screenCopy('agentWorkflow');
  const progress = computeChecklist(stateFor(situation, done));
  if (!progress.nextItem) {
    return { next: null, phase: null, message: copy.allDone };
  }
  return {
    next: buildStep(progress.nextItem),
    phase: progress.currentPhase,
    message: copy.whatDoneMeans,
  };
}

/** The whole list in order, the two separate lists, and the first step. */
export function startWorkflow(situation: Situation): StartWorkflowResult {
  return {
    instruction: screenCopy('agentWorkflow').agentInstruction,
    steps: timeSteps(),
    obituarySteps: listFor('obituary'),
    planningServiceSteps: listFor('planning-service'),
    obituaryNote: screenCopy('cmsChecklist').obituaryNote,
    first: nextStep(situation, []).next,
  };
}
