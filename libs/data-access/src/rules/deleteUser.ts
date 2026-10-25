import {
  DeleteCommand,
  QueryCommand,
  UpdateCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import type { Clock } from '../clock.js';
import {
  FLOW_PREFIX,
  flowGuardKey,
  INVITE_PREFIX,
  MEMBER_PREFIX,
  memberKey,
  memberOfKey,
  profileKey,
  refPk,
  tokenKey,
  userPk,
  type Key,
} from '../keys.js';
import type { Item } from '../read.js';

const CONCURRENCY = 10;

function isConditionFailure(error: unknown): boolean {
  return (
    (error as { name?: string } | null)?.name ===
    'ConditionalCheckFailedException'
  );
}

/** Runs the tasks a few at a time. Any failure rejects, so the webhook answers 5xx and Clerk retries. */
async function inChunks(tasks: Array<() => Promise<unknown>>): Promise<void> {
  for (let i = 0; i < tasks.length; i += CONCURRENCY) {
    await Promise.all(tasks.slice(i, i + CONCURRENCY).map((task) => task()));
  }
}

/** Every item of a query, all pages, expired ones included (they are still stored data). */
async function queryAll(
  doc: DynamoDBDocumentClient,
  input: { table: string; index?: string; keyName: string; value: string },
): Promise<Item[]> {
  const items: Item[] = [];
  let start: Record<string, unknown> | undefined;
  do {
    const page = await doc.send(
      new QueryCommand({
        TableName: input.table,
        IndexName: input.index,
        ConsistentRead: input.index ? undefined : true,
        KeyConditionExpression: `${input.keyName} = :v`,
        ExpressionAttributeValues: { ':v': input.value },
        ExclusiveStartKey: start,
      }),
    );
    items.push(...(page.Items ?? []));
    start = page.LastEvaluatedKey;
  } while (start);
  return items;
}

const remove = (doc: DynamoDBDocumentClient, table: string, key: Key) => () =>
  doc.send(new DeleteCommand({ TableName: table, Key: key }));

/** Bumps a profile version if it exists, so the other user's open screens notice the change. */
const touchProfile =
  (
    doc: DynamoDBDocumentClient,
    table: string,
    userId: string,
    now: string,
    toOwner: boolean,
  ) =>
  async () => {
    try {
      await doc.send(
        new UpdateCommand({
          TableName: table,
          Key: profileKey(userId),
          ConditionExpression: 'attribute_exists(pk)',
          UpdateExpression: toOwner
            ? 'SET accountType = :owner, #version = if_not_exists(#version, :zero) + :one, updatedAt = :now'
            : 'SET #version = if_not_exists(#version, :zero) + :one, updatedAt = :now',
          ExpressionAttributeNames: { '#version': 'version' },
          ExpressionAttributeValues: {
            ':zero': 0,
            ':one': 1,
            ':now': now,
            ...(toOwner ? { ':owner': 'owner' } : {}),
          },
        }),
      );
    } catch (error) {
      if (!isConditionFailure(error)) {
        throw error;
      }
    }
  };

/**
 * Deletes everything stored for one user (#327). Service path only: see app.ts.
 * Idempotent, and safe to re-run after a crash: the user's own partition goes last, and the things
 * found through it (owner, members, flows, invites) are handled before it.
 *
 * Touches other users only to remove this user from them: the MEMBER# row in the owner's partition,
 * MEMBER_OF of this user's members (they become owners again), the `updatedBy` of flows this user last
 * edited (set to null, as the flow item documents), and invites this user accepted.
 */
export async function deleteUser(
  doc: DynamoDBDocumentClient,
  table: string,
  userId: string,
  clock: Clock,
): Promise<void> {
  const now = clock.now().toISOString();
  const own = await queryAll(doc, {
    table,
    keyName: 'pk',
    value: userPk(userId),
  });

  // 1. This user as a member of someone else.
  const memberOf = own.find((item) => item['sk'] === 'MEMBER_OF');
  const ownerId = memberOf?.['ownerId'];
  if (typeof ownerId === 'string' && ownerId !== userId) {
    await remove(doc, table, memberKey(ownerId, userId))();
    await touchProfile(doc, table, ownerId, now, false)();
  }

  // 2. Items in other partitions that point at this user (gsi1 REF#).
  const refs = await queryAll(doc, {
    table,
    index: 'gsi1',
    keyName: 'gsi1pk',
    value: refPk(userId),
  });
  const refTasks: Array<() => Promise<unknown>> = [];
  for (const ref of refs) {
    const pk = ref['pk'];
    const sk = ref['sk'];
    if (
      typeof pk !== 'string' ||
      typeof sk !== 'string' ||
      pk === userPk(userId)
    ) {
      continue;
    }
    const key = { pk, sk };
    if (sk.startsWith(INVITE_PREFIX)) {
      // An invite this user accepted: it carries their email. The TOKEN# guard stays so the hash stays used.
      refTasks.push(remove(doc, table, key));
    } else if (sk.startsWith(FLOW_PREFIX)) {
      refTasks.push(async () => {
        try {
          await doc.send(
            new UpdateCommand({
              TableName: table,
              Key: key,
              ConditionExpression: 'gsi1pk = :ref',
              UpdateExpression: 'SET updatedBy = :null REMOVE gsi1pk, gsi1sk',
              ExpressionAttributeValues: {
                ':ref': refPk(userId),
                ':null': null,
              },
            }),
          );
        } catch (error) {
          if (!isConditionFailure(error)) {
            throw error;
          }
        }
      });
    }
  }
  await inChunks(refTasks);

  // 3. This user's own members become owners again (as removeMember does).
  const memberRows = own.filter(
    (item) =>
      typeof item['sk'] === 'string' && item['sk'].startsWith(MEMBER_PREFIX),
  );
  const memberTasks: Array<() => Promise<unknown>> = [];
  for (const row of memberRows) {
    const memberId = row['memberId'];
    if (typeof memberId !== 'string' || memberId === userId) {
      continue;
    }
    memberTasks.push(async () => {
      try {
        await doc.send(
          new DeleteCommand({
            TableName: table,
            Key: memberOfKey(memberId),
            ConditionExpression: 'ownerId = :owner',
            ExpressionAttributeValues: { ':owner': userId },
          }),
        );
      } catch (error) {
        if (!isConditionFailure(error)) {
          throw error;
        }
        return;
      }
      await touchProfile(doc, table, memberId, now, true)();
    });
  }
  await inChunks(memberTasks);

  // 4. Guards that live outside the user's partition: one per flow and one per invite token.
  const guardTasks: Array<() => Promise<unknown>> = [];
  for (const item of own) {
    const sk = item['sk'];
    if (typeof sk !== 'string') {
      continue;
    }
    if (sk.startsWith(FLOW_PREFIX) && typeof item['id'] === 'string') {
      guardTasks.push(remove(doc, table, flowGuardKey(item['id'])));
    } else if (
      sk.startsWith(INVITE_PREFIX) &&
      typeof item['tokenHash'] === 'string'
    ) {
      guardTasks.push(remove(doc, table, tokenKey(item['tokenHash'])));
    }
  }
  await inChunks(guardTasks);

  // 5. The user's own partition, profile last.
  const ownKeys = own
    .map((item) => ({ pk: item['pk'] as string, sk: item['sk'] as string }))
    .filter((key) => key.sk !== profileKey(userId).sk);
  await inChunks(ownKeys.map((key) => remove(doc, table, key)));
  await remove(doc, table, profileKey(userId))();
}
