import {
  FLOW_DETAIL_KEYS,
  FLOW_DETAIL_TEXT_KEYS,
  FLOW_STATUS_KEYS,
  parseFlowDetails,
  parseFlowFacts,
  parseFlowPatch,
  splitSyncedPatch,
  type FlowDetails,
  type FlowFacts,
} from '@griever/shared';
import { flowKey, refGsi } from '../keys.js';
import { type Item } from '../read.js';

export interface FlowItem {
  id: string;
  ownerId: string;
  facts: FlowFacts;
  /** Every detail key. A key never written reads as null (burialPrivate: false). */
  details: FlowDetails;
  createdAt: string;
  updatedAt: string;
  /** Who made the last change. Null if that user was deleted. */
  updatedBy: string | null;
  /** Set by a soft delete (#216). Absent while the person is live. */
  deletedAt?: string;
}

/** A person with no detail yet: every text and status null, burialPrivate false. */
export function emptyDetails(): FlowDetails {
  const out: Record<string, unknown> = { burialPrivate: false };
  for (const key of [...FLOW_DETAIL_TEXT_KEYS, ...FLOW_STATUS_KEYS]) {
    out[key] = null;
  }
  return out as FlowDetails;
}

/**
 * Splits one flat input (the six facts plus any detail keys) into its two halves and checks each
 * with the shared parser (C8). Unknown and forbidden keys make the whole input invalid.
 */
export function parseFlowInput(
  input: unknown,
): { facts: Partial<FlowFacts>; details: Partial<FlowDetails> } | null {
  const split = splitSyncedPatch(input);
  if (!split) {
    return null;
  }
  const facts = parseFlowPatch(split.facts);
  const details = parseFlowDetails(split.details);
  return facts && details ? { facts, details } : null;
}

export function encodeFlow(flow: FlowItem): Item {
  const facts = parseFlowFacts(flow.facts);
  if (!facts) {
    throw new Error('Flow facts are invalid.');
  }
  const details = parseFlowDetails(flow.details);
  if (!details || FLOW_DETAIL_KEYS.some((key) => !Object.hasOwn(details, key))) {
    throw new Error('Flow details are invalid.');
  }
  return {
    ...flowKey(flow.ownerId, flow.id),
    entity: 'FLOW',
    id: flow.id,
    ownerId: flow.ownerId,
    personName: facts.personName,
    dateOfPassing: facts.dateOfPassing,
    serviceDate: facts.serviceDate,
    obituaryUrl: facts.obituaryUrl,
    obituaryPublisher: facts.obituaryPublisher,
    serviceReady: facts.serviceReady,
    ...details,
    createdAt: flow.createdAt,
    updatedAt: flow.updatedAt,
    updatedBy: flow.updatedBy,
    ...(flow.deletedAt ? { deletedAt: flow.deletedAt } : {}),
    ...(flow.updatedBy ? refGsi(flow.updatedBy, 'FLOW', flow.id) : {}),
  };
}
export function decodeFlow(item: Item): FlowItem {
  const { id, ownerId, createdAt, updatedAt, updatedBy, deletedAt } = item;
  const facts = parseFlowFacts({
    personName: item.personName,
    dateOfPassing: item.dateOfPassing,
    serviceDate: item.serviceDate,
    obituaryUrl: item.obituaryUrl,
    obituaryPublisher: item.obituaryPublisher,
    serviceReady: item.serviceReady,
  });
  const details = emptyDetails() as Record<string, unknown>;
  for (const key of FLOW_DETAIL_KEYS) {
    if (item[key] !== undefined) {
      details[key] = item[key];
    }
  }
  const parsedDetails = parseFlowDetails(details);
  if (
    !facts ||
    !parsedDetails ||
    typeof id !== 'string' ||
    typeof ownerId !== 'string' ||
    typeof createdAt !== 'string' ||
    typeof updatedAt !== 'string' ||
    (updatedBy !== null && typeof updatedBy !== 'string')
  ) {
    throw new Error('Flow item is broken.');
  }
  const flow: FlowItem = {
    id,
    ownerId,
    facts,
    details: parsedDetails as FlowDetails,
    createdAt,
    updatedAt,
    updatedBy,
  };
  if (typeof deletedAt === 'string') {
    flow.deletedAt = deletedAt;
  }
  return flow;
}
