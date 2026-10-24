import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import type { FlowRecord, FlowRole } from '@griever/shared';
import type { Caller } from '../caller.js';
import type { Clock } from '../clock.js';
import { decodeFlow, type FlowItem } from '../items/flowItem.js';
import { FLOW_PREFIX, memberOfKey } from '../keys.js';
import { getLive, queryLive } from '../read.js';

/** The shape the app reads. The role says how the caller is linked to this person. */
function toRecord(flow: FlowItem, role: FlowRole): FlowRecord {
  return {
    id: flow.id,
    ownerId: flow.ownerId,
    role,
    facts: flow.facts,
    updatedAt: flow.updatedAt,
    updatedBy: flow.updatedBy,
  };
}

/** The owner this user is a member of, or undefined when they are not a member. */
async function memberOwnerId(
  doc: DynamoDBDocumentClient,
  table: string,
  userId: string,
  clock: Clock,
): Promise<string | undefined> {
  const item = await getLive(doc, table, memberOfKey(userId), clock);
  if (!item) {
    return undefined;
  }
  const ownerId = item['ownerId'];
  if (typeof ownerId !== 'string') {
    throw new Error('Membership item is broken.');
  }
  return ownerId;
}

/**
 * The caller's own people, plus the owner's people when the caller is a member.
 * A stranger gets []. Soft-deleted items are not filtered yet (#216).
 */
export async function listFlows(
  doc: DynamoDBDocumentClient,
  table: string,
  caller: Caller,
  clock: Clock,
): Promise<FlowRecord[]> {
  const own = await queryLive(doc, table, caller.userId, clock, FLOW_PREFIX);
  const records = own.map((item) => toRecord(decodeFlow(item), 'owner'));
  const ownerId = await memberOwnerId(doc, table, caller.userId, clock);
  if (ownerId) {
    const shared = await queryLive(doc, table, ownerId, clock, FLOW_PREFIX);
    for (const item of shared) {
      records.push(toRecord(decodeFlow(item), 'member'));
    }
  }
  return records;
}
