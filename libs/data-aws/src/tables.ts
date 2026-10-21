import {
  CreateTableCommand,
  DescribeTableCommand,
  ResourceInUseException,
  type CreateTableCommandInput,
  type DynamoDBClient,
} from '@aws-sdk/client-dynamodb';
import type { AwsConfig } from './config.js';

/**
 * Table design. Plan v4 (docs/aws-migration-plan.md) names `gg-content` and its keys.
 * It does not name the data table keys, so this is the simplest single-table design:
 *
 *   gg-data     pk (S) + sk (S), and one index `gsi1` on gsi1pk + gsi1sk for "find by email".
 *   gg-content  kind (S, partition key) + id (S, sort key).
 *
 * Both tables are on demand (pay per request), like the plan's cost model.
 */
export function tableDefinitions(config: AwsConfig): CreateTableCommandInput[] {
  return [
    {
      TableName: config.dataTable,
      BillingMode: 'PAY_PER_REQUEST',
      AttributeDefinitions: [
        { AttributeName: 'pk', AttributeType: 'S' },
        { AttributeName: 'sk', AttributeType: 'S' },
        { AttributeName: 'gsi1pk', AttributeType: 'S' },
        { AttributeName: 'gsi1sk', AttributeType: 'S' },
      ],
      KeySchema: [
        { AttributeName: 'pk', KeyType: 'HASH' },
        { AttributeName: 'sk', KeyType: 'RANGE' },
      ],
      GlobalSecondaryIndexes: [
        {
          IndexName: 'gsi1',
          KeySchema: [
            { AttributeName: 'gsi1pk', KeyType: 'HASH' },
            { AttributeName: 'gsi1sk', KeyType: 'RANGE' },
          ],
          Projection: { ProjectionType: 'ALL' },
        },
      ],
    },
    {
      TableName: config.contentTable,
      BillingMode: 'PAY_PER_REQUEST',
      AttributeDefinitions: [
        { AttributeName: 'kind', AttributeType: 'S' },
        { AttributeName: 'id', AttributeType: 'S' },
      ],
      KeySchema: [
        { AttributeName: 'kind', KeyType: 'HASH' },
        { AttributeName: 'id', KeyType: 'RANGE' },
      ],
    },
  ];
}

/** Creates one table. Returns false when it already exists, so a second run is safe. */
async function ensureTable(
  client: DynamoDBClient,
  def: CreateTableCommandInput,
): Promise<boolean> {
  try {
    await client.send(new DescribeTableCommand({ TableName: def.TableName }));
    return false;
  } catch (error) {
    if ((error as { name?: string }).name !== 'ResourceNotFoundException') throw error;
  }
  try {
    await client.send(new CreateTableCommand(def));
    return true;
  } catch (error) {
    if (error instanceof ResourceInUseException) return false;
    throw error;
  }
}

/** Creates the plan v4 tables. Returns the names it created (empty on a repeat run). */
export async function ensureTables(
  client: DynamoDBClient,
  config: AwsConfig,
): Promise<string[]> {
  const created: string[] = [];
  for (const def of tableDefinitions(config)) {
    if (await ensureTable(client, def)) created.push(def.TableName as string);
  }
  return created;
}
