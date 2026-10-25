import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import {
  isUuid,
  parseFlowFacts,
  type FlowRecord,
  type FlowRole,
} from '@griever/shared';
import type { Caller } from '../caller.js';
import type { Clock } from '../clock.js';
import type { DataErrorCode } from '../errors.js';
import { decodeFlow, encodeFlow, type FlowItem } from '../items/flowItem.js';
import {
  encodeProfile,
  getProfile,
  type Profile,
} from '../items/profileItem.js';
import { FLOW_PREFIX, flowGuardKey, memberOfKey, profileKey } from '../keys.js';
import { getLive, queryLive } from '../read.js';
import { runAction, type RunOptions, type TransactItem } from '../transact.js';

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

export type FlowResult<T> =
  | { ok: true; value: T }
  | { ok: false; code: DataErrorCode | 'invalid' };

/** Thrown inside an action when its reads already say no, so nothing is written. */
class Refusal extends Error {
  readonly code: DataErrorCode;
  constructor(code: DataErrorCode) {
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
function profileWrite(
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
): Promise<FlowResult<FlowRecord>> {
  const parsed = parseFlowFacts(facts);
  if (!parsed || !isUuid(id)) {
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
