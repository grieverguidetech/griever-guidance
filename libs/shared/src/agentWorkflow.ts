import type { ChecklistItemId, ChecklistPhaseKey } from './checklist.js';

export const DISPOSITIONS = ['burial', 'cremation', 'undecided'] as const;

export type Disposition = (typeof DISPOSITIONS)[number];

/** What the assistant may know about the family. Nothing else is ever passed in. */
export interface Situation {
  disposition: Disposition;
}

export type StepActor = 'you' | 'assistant';

export interface WorkflowStep {
  id: ChecklistItemId;
  phase: ChecklistPhaseKey;
  title: string;
  actor: StepActor;
  whatItIs: string;
  whyItMatters: string;
  whoToCall?: string;
  whatToBring?: string;
  doesNotApplyWhen?: string;
  /** Only on the step where the person tells close family themselves. */
  handOff?: string;
}

export interface WorkflowStepSummary {
  id: ChecklistItemId;
  phase: ChecklistPhaseKey;
  title: string;
  actor: StepActor;
}

export interface WorkflowListItem {
  id: ChecklistItemId;
  title: string;
}

export interface StartWorkflowResult {
  instruction: string;
  steps: WorkflowStepSummary[];
  obituarySteps: WorkflowListItem[];
  planningServiceSteps: WorkflowListItem[];
  obituaryNote: string;
  first: WorkflowStep | null;
}

export interface NextStepResult {
  next: WorkflowStep | null;
  phase: ChecklistPhaseKey | null;
  /** The all-done line when next is null, otherwise the one line on what done means. */
  message: string;
}
