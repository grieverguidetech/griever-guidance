import { GetCommand, QueryCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import type { Clock } from './clock.js';
import type { Key } from './keys.js';

export type Item = Record<string, unknown>;

/**
 * DynamoDB deletes expired items late, so every read drops items whose `ttl` (epoch seconds) is at
 * or before now. An item with no ttl never expires.
 */
export function isLive(item: Item, clock: Clock): boolean {
  const ttl = item['ttl'];
  if (typeof ttl !== 'number') return true;
  return ttl * 1000 > clock.now().getTime();
}

/** A consistent read of one item. Undefined when missing or expired. */
export async function getLive(
  doc: DynamoDBDocumentClient,
  table: string,
  key: Key,
  clock: Clock,
): Promise<Item | undefined> {
  const { Item } = await doc.send(new GetCommand({ TableName: table, Key: key, ConsistentRead: true }));
  return Item && isLive(Item, clock) ? Item : undefined;
}

/** A consistent query of one partition, optionally by sort-key prefix. Follows pages. */
export async function queryLive(
  doc: DynamoDBDocumentClient,
  table: string,
  pk: string,
  clock: Clock,
  skPrefix?: string,
): Promise<Item[]> {
  const items: Item[] = [];
  let start: Record<string, unknown> | undefined;
  do {
    const page = await doc.send(
      new QueryCommand({
        TableName: table,
        ConsistentRead: true,
        KeyConditionExpression: skPrefix ? 'pk = :pk AND begins_with(sk, :p)' : 'pk = :pk',
        ExpressionAttributeValues: skPrefix ? { ':pk': pk, ':p': skPrefix } : { ':pk': pk },
        ExclusiveStartKey: start,
      }),
    );
    items.push(...(page.Items ?? []));
    start = page.LastEvaluatedKey;
  } while (start);
  return items.filter((item) => isLive(item, clock));
}
