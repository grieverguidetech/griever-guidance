import { parseFlowFacts, type FlowFacts } from '@griever/shared';
import { flowKey, refGsi } from '../keys.js';
import { type Item } from '../read.js';

export interface FlowItem {
  id: string;
  ownerId: string;
  facts: FlowFacts;
  createdAt: string;
  updatedAt: string;
  /** Who made the last change. Null if that user was deleted. */
  updatedBy: string | null;
  /** Set by a soft delete (#216). Absent while the person is live. */
  deletedAt?: string;
}

export function encodeFlow(flow: FlowItem): Item {
  const facts = parseFlowFacts(flow.facts);
  if (!facts) {
    throw new Error('Flow facts are invalid.');
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
  if (
    !facts ||
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
    createdAt,
    updatedAt,
    updatedBy,
  };
  if (typeof deletedAt === 'string') flow.deletedAt = deletedAt;
  return flow;
}
