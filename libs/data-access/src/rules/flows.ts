import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import {
  isUuid,
  parseFlowFacts,
  type FlowDetails,
  type FlowRecord,
  type FlowRole,
} from '@griever/shared';
import {
  FLOW_PREFIX,
  flowGuardKey,
  flowKey,
  memberOfKey,
  profileKey,
  refGsi,
} from '../keys.js';
import type { Caller } from '../caller.js';
import type { Clock } from '../clock.js';
import type { DataErrorCode } from '../errors.js';
import {
  decodeFlow,
  emptyDetails,
  encodeFlow,
  parseFlowInput,
  type FlowItem,
} from '../items/flowItem.js';
import {
  encodeProfile,
  getProfile,
  type Profile,
} from '../items/profileItem.js';
import { getLive, queryLive } from '../read.js';
import { runAction, type RunOptions, type TransactItem } from '../transact.js';

/** What the app reads: the record plus every detail key. */
export type FlowRecordWithDetails = FlowRecord & { details: FlowDetails };

/** The shape the app reads. The role says how the caller is linked to this person. */
function toRecord(flow: FlowItem, role: FlowRole): FlowRecordWithDetails {
  return {
    id: flow.id,
    ownerId: flow.ownerId,
    role,
    facts: flow.facts,
    details: flow.details,
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
): Promise<FlowRecordWithDetails[]> {
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

export type FlowResult<T> =
  | { ok: true; value: T }
  | { ok: false; code: DataErrorCode | 'invalid' };

/** Thrown inside an action when its reads already say no, so nothing is written. */
export class Refusal extends Error {
  readonly code: DataErrorCode | 'invalid';
  constructor(code: DataErrorCode | 'invalid') {
    super(code);
    this.code = code;
  }
}

// Positions in the createFlow transaction. A failed condition reports its position.
const CREATE_GUARD = 0;
const CREATE_MEMBERSHIP = 2;
const CREATE_PROFILE = 3;

/**
 * Bumps the profile version only if nobody changed it since we read it and it is still an owner.
 * With no profile yet, it creates one as owner.
 */
export function profileWrite(
  table: string,
  userId: string,
  profile: Profile | undefined,
  now: string,
): TransactItem {
  if (!profile) {
    return {
      Put: {
        TableName: table,
        Item: encodeProfile({
          userId,
          accountType: 'owner',
          version: 1,
          createdAt: now,
          updatedAt: now,
        }),
        ConditionExpression: 'attribute_not_exists(pk)',
      },
    };
  }
  return {
    Update: {
      TableName: table,
      Key: profileKey(userId),
      UpdateExpression: 'SET #version = #version + :one, updatedAt = :now',
      ConditionExpression: '#version = :seen AND accountType = :owner',
      ExpressionAttributeNames: { '#version': 'version' },
      ExpressionAttributeValues: {
        ':one': 1,
        ':now': now,
        ':seen': profile.version,
        ':owner': 'owner',
      },
    },
  };
}

/**
 * Creates a person for the caller, as owner. A member can never create one (C11).
 * One transaction writes the id guard and the flow, checks there is no MEMBER_OF item,
 * and bumps the profile version.
 */
export async function createFlow(
  doc: DynamoDBDocumentClient,
  table: string,
  caller: Caller,
  id: string,
  facts: unknown,
  clock: Clock,
  options: RunOptions = {},
): Promise<FlowResult<FlowRecordWithDetails>> {
  const input = parseFlowInput(facts);
  const parsed = input ? parseFlowFacts(input.facts) : null;
  if (!input || !parsed || !isUuid(id)) {
    return { ok: false, code: 'invalid' };
  }
  try {
    const result = await runAction(
      doc,
      async () => {
        const now = clock.now().toISOString();
        const profile = await getProfile(doc, table, caller.userId, clock);
        if (profile?.accountType === 'member') {
          throw new Refusal('forbidden');
        }
        const flow: FlowItem = {
          id,
          ownerId: caller.userId,
          facts: parsed,
          details: { ...emptyDetails(), ...input.details },
          createdAt: now,
          updatedAt: now,
          updatedBy: caller.userId,
        };
        const items: TransactItem[] = [
          {
            Put: {
              TableName: table,
              Item: {
                ...flowGuardKey(id),
                entity: 'FLOW_GUARD',
                ownerId: caller.userId,
              },
              ConditionExpression: 'attribute_not_exists(pk)',
            },
          },
          { Put: { TableName: table, Item: encodeFlow(flow) } },
          {
            ConditionCheck: {
              TableName: table,
              Key: memberOfKey(caller.userId),
              ConditionExpression: 'attribute_not_exists(pk)',
            },
          },
          profileWrite(table, caller.userId, profile, now),
        ];
        return {
          items,
          value: toRecord(flow, 'owner'),
          retryOn: [CREATE_PROFILE],
        };
      },
      options,
    );
    if (result.status === 'ok') {
      return { ok: true, value: result.value };
    }
    if (result.status === 'busy') {
      return { ok: false, code: 'busy' };
    }
    if (result.failedIndex === CREATE_GUARD) {
      return { ok: false, code: 'conflict' };
    }
    if (result.failedIndex === CREATE_MEMBERSHIP) {
      return { ok: false, code: 'forbidden' };
    }
    throw new Error(
      `createFlow: unexpected failed condition at ${result.failedIndex}.`,
    );
  } catch (error) {
    if (error instanceof Refusal) {
      return { ok: false, code: error.code };
    }
    throw error;
  }
}

// Positions in the updateFlow transaction.
const UPDATE_FLOW = 0;
const UPDATE_MEMBERSHIP = 1;

/** Finds the flow the caller may change: their own, or their owner's when they are a member. */
async function findEditable(
  doc: DynamoDBDocumentClient,
  table: string,
  caller: Caller,
  id: string,
  clock: Clock,
): Promise<{ flow: FlowItem; role: FlowRole } | undefined> {
  const own = await getLive(doc, table, flowKey(caller.userId, id), clock);
  if (own) {
    return { flow: decodeFlow(own), role: 'owner' };
  }
  const ownerId = await memberOwnerId(doc, table, caller.userId, clock);
  if (!ownerId) {
    return undefined;
  }
  const shared = await getLive(doc, table, flowKey(ownerId, id), clock);
  if (!shared) {
    return undefined;
  }
  return { flow: decodeFlow(shared), role: 'member' };
}

/**
 * Changes facts and detail keys on a person. The owner and the owner's members may do it. Only
 * those keys can change: any other key, such as ownerId or updatedAt, is invalid. A stranger, an unknown id, a removed
 * member and a soft-deleted person all get not_found, and nothing changes.
 */
export async function updateFlow(
  doc: DynamoDBDocumentClient,
  table: string,
  caller: Caller,
  id: string,
  patch: unknown,
  clock: Clock,
  options: RunOptions = {},
): Promise<FlowResult<FlowRecordWithDetails>> {
  const input = parseFlowInput(patch);
  if (!input || !isUuid(id)) {
    return { ok: false, code: 'invalid' };
  }
  try {
    const result = await runAction(
      doc,
      async () => {
        const found = await findEditable(doc, table, caller, id, clock);
        if (!found || found.flow.deletedAt) {
          throw new Refusal('not_found');
        }
        const { flow, role } = found;
        const ref = refGsi(caller.userId, 'FLOW', id);
        const names: Record<string, string> = {
          '#updatedAt': 'updatedAt',
          '#updatedBy': 'updatedBy',
          '#gsi1pk': 'gsi1pk',
          '#gsi1sk': 'gsi1sk',
        };
        const values: Record<string, unknown> = {
          ':now': clock.now().toISOString(),
          ':by': caller.userId,
          ':gsi1pk': ref.gsi1pk,
          ':gsi1sk': ref.gsi1sk,
        };
        const sets = [
          '#updatedAt = :now',
          '#updatedBy = :by',
          '#gsi1pk = :gsi1pk',
          '#gsi1sk = :gsi1sk',
        ];
        for (const [key, value] of Object.entries({ ...input.facts, ...input.details })) {
          names[`#${key}`] = key;
          values[`:${key}`] = value;
          sets.push(`#${key} = :${key}`);
        }
        const items: TransactItem[] = [
          {
            Update: {
              TableName: table,
              Key: flowKey(flow.ownerId, id),
              UpdateExpression: `SET ${sets.join(', ')}`,
              ConditionExpression:
                'attribute_exists(pk) AND attribute_not_exists(deletedAt)',
              ExpressionAttributeNames: names,
              ExpressionAttributeValues: values,
            },
          },
        ];
        if (role === 'member') {
          items.push({
            ConditionCheck: {
              TableName: table,
              Key: memberOfKey(caller.userId),
              ConditionExpression: 'ownerId = :owner',
              ExpressionAttributeValues: { ':owner': flow.ownerId },
            },
          });
        }
        return { items, value: role };
      },
      options,
    );
    if (result.status === 'busy') {
      return { ok: false, code: 'busy' };
    }
    if (result.status === 'failed') {
      if (
        result.failedIndex === UPDATE_FLOW ||
        result.failedIndex === UPDATE_MEMBERSHIP
      ) {
        return { ok: false, code: 'not_found' };
      }
      throw new Error(
        `updateFlow: unexpected failed condition at ${result.failedIndex}.`,
      );
    }
    // Read the item back, so the answer also shows changes other people made at the same time.
    const saved = await findEditable(doc, table, caller, id, clock);
    if (!saved) {
      return { ok: false, code: 'not_found' };
    }
    return { ok: true, value: toRecord(saved.flow, result.value) };
  } catch (error) {
    if (error instanceof Refusal) {
      return { ok: false, code: error.code };
    }
    throw error;
  }
}
