import { BatchWriteCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import type { AwsConfig } from './config.js';
import { buildContent, type ContentItem } from './content.js';

const BATCH_LIMIT = 25; // DynamoDB allows 25 writes in one batch.

/** Writes every content item. Safe to run twice: a put replaces the item with the same key. */
export async function seedContent(
  doc: DynamoDBDocumentClient,
  config: AwsConfig,
  items: ContentItem[] = buildContent(),
): Promise<number> {
  for (let start = 0; start < items.length; start += BATCH_LIMIT) {
    const batch = items.slice(start, start + BATCH_LIMIT);
    await doc.send(
      new BatchWriteCommand({
        RequestItems: {
          [config.contentTable]: batch.map((Item) => ({ PutRequest: { Item } })),
        },
      }),
    );
  }
  return items.length;
}
