import { McpServer } from '@modelcontextprotocol/server';
import { nextStep, startWorkflow } from '@griever/agent-workflow';
import { screenCopy } from '@griever/copy';
import { CHECKLIST_PHASES, DISPOSITIONS } from '@griever/shared';
import { z } from 'zod';

const STEP_IDS = CHECKLIST_PHASES.flatMap((phase) => [...phase.itemIds]) as [
  string,
  ...string[],
];
const PHASE_KEYS = CHECKLIST_PHASES.map((phase) => phase.key) as [
  string,
  ...string[],
];

/** Inputs are a choice from a fixed list and step ids. No names, contacts or free text (C8). */
const situationInput = z.strictObject({
  situation: z.strictObject({ disposition: z.enum(DISPOSITIONS) }),
});
const nextStepInput = z.strictObject({
  situation: z.strictObject({ disposition: z.enum(DISPOSITIONS) }),
  done: z.array(z.enum(STEP_IDS)).max(STEP_IDS.length),
});

const stepSchema = z.strictObject({
  id: z.string(),
  phase: z.enum(PHASE_KEYS),
  title: z.string(),
  actor: z.enum(['you', 'assistant']),
  whatItIs: z.string(),
  whyItMatters: z.string(),
  whoToCall: z.string().optional(),
  whatToBring: z.string().optional(),
  doesNotApplyWhen: z.string().optional(),
  handOff: z.string().optional(),
});
const listItemSchema = z.strictObject({ id: z.string(), title: z.string() });

const startOutput = z.strictObject({
  instruction: z.string(),
  steps: z.array(
    listItemSchema.extend({
      phase: z.enum(PHASE_KEYS),
      actor: z.enum(['you', 'assistant']),
    }),
  ),
  obituarySteps: z.array(listItemSchema),
  planningServiceSteps: z.array(listItemSchema),
  obituaryNote: z.string(),
  first: stepSchema.nullable(),
});
const nextOutput = z.strictObject({
  next: stepSchema.nullable(),
  phase: z.enum(PHASE_KEYS).nullable(),
  message: z.string(),
});

const annotations = {
  readOnlyHint: true,
  idempotentHint: true,
  openWorldHint: false,
};

/** The same data twice: structured for clients that read it, as text for the ones that show it. */
const reply = (result: object) => ({
  content: [{ type: 'text' as const, text: JSON.stringify(result) }],
  structuredContent: { ...result } as Record<string, unknown>,
});

/** A fresh server for each request. It holds no state. */
export function createAgentServer(): McpServer {
  const copy = screenCopy('agentWorkflow');
  const server = new McpServer({
    name: 'griever-guidance-agent',
    version: '0.0.1',
  });
  server.registerTool(
    'start_workflow',
    {
      title: copy.startWorkflowTitle,
      description: copy.startWorkflowDescription,
      inputSchema: situationInput,
      outputSchema: startOutput,
      annotations,
    },
    ({ situation }) => reply(startWorkflow(situation)),
  );
  server.registerTool(
    'next_step',
    {
      title: copy.nextStepTitle,
      description: copy.nextStepDescription,
      inputSchema: nextStepInput,
      outputSchema: nextOutput,
      annotations,
    },
    ({ situation, done }) => reply(nextStep(situation, done)),
  );
  return server;
}
