import {
  CreateTableCommand,
  DescribeTableCommand,
  DescribeTimeToLiveCommand,
  UpdateTimeToLiveCommand,
  waitUntilTableExists,
  type CreateTableCommandInput,
  type DynamoDBClient,
  type KeySchemaElement,
} from '@aws-sdk/client-dynamodb';
import type { AwsConfig } from './config.js';

/**
 * Table design. Plan v4 (docs/aws-migration-plan.md) names `gg-content` and its keys.
 * It does not name the data table keys, so this is the simplest single-table design:
 *
 *   gg-data     pk (S) + sk (S), and one index `gsi1` on gsi1pk + gsi1sk for "find by email".
 *   gg-content  kind (S, partition key) + id (S, sort key).
 *
 * gg-data also has time to live (TTL) on the attribute `ttl` (epoch seconds), for expiring items.
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

/** The one TTL attribute name on gg-data. */
export const TTL_ATTRIBUTE = 'ttl';

const sameKeys = (a: KeySchemaElement[] = [], b: KeySchemaElement[] = []) =>
  JSON.stringify(a.map((k) => [k.AttributeName, k.KeyType])) ===
  JSON.stringify(b.map((k) => [k.AttributeName, k.KeyType]));

/** Throws a clear error when an existing table does not have the keys and indexes we expect. */
async function assertSameShape(client: DynamoDBClient, def: CreateTableCommandInput): Promise<void> {
  const { Table } = await client.send(new DescribeTableCommand({ TableName: def.TableName }));
  const problems: string[] = [];
  if (!sameKeys(Table?.KeySchema, def.KeySchema)) problems.push('key schema differs');
  const have = new Map((Table?.GlobalSecondaryIndexes ?? []).map((g) => [g.IndexName, g.KeySchema]));
  const want = def.GlobalSecondaryIndexes ?? [];
  for (const g of want) {
    if (!have.has(g.IndexName)) problems.push(`index ${g.IndexName} is missing`);
    else if (!sameKeys(have.get(g.IndexName), g.KeySchema)) problems.push(`index ${g.IndexName} keys differ`);
  }
  for (const name of have.keys()) {
    if (!want.some((g) => g.IndexName === name)) problems.push(`index ${name} is not expected`);
  }
  if (problems.length) {
    throw new Error(
      `Table ${def.TableName} exists but does not match plan v4: ${problems.join(', ')}. ` +
        'Run "pnpm aws:down" and start again.',
    );
  }
}

/** Creates one table and waits until it is ACTIVE. Returns false when it already exists. */
async function ensureTable(client: DynamoDBClient, def: CreateTableCommandInput): Promise<boolean> {
  let created = false;
  try {
    await client.send(new CreateTableCommand(def));
    created = true;
  } catch (error) {
    if ((error as { name?: string }).name !== 'ResourceInUseException') throw error;
  }
  await waitUntilTableExists({ client, maxWaitTime: 30 }, { TableName: def.TableName });
  if (!created) await assertSameShape(client, def);
  return created;
}

/** Turns on TTL for gg-data. Reads the state first, so a second run changes nothing. */
async function ensureTtl(client: DynamoDBClient, tableName: string): Promise<void> {
  const { TimeToLiveDescription } = await client.send(new DescribeTimeToLiveCommand({ TableName: tableName }));
  const status = TimeToLiveDescription?.TimeToLiveStatus;
  if (status === 'ENABLED' || status === 'ENABLING') return;
  await client.send(
    new UpdateTimeToLiveCommand({
      TableName: tableName,
      TimeToLiveSpecification: { Enabled: true, AttributeName: TTL_ATTRIBUTE },
    }),
  );
}

/** Creates the plan v4 tables. Returns the names it created (empty on a repeat run). */
export async function ensureTables(client: DynamoDBClient, config: AwsConfig): Promise<string[]> {
  const created: string[] = [];
  for (const def of tableDefinitions(config)) {
    if (await ensureTable(client, def)) created.push(def.TableName as string);
  }
  await ensureTtl(client, config.dataTable);
  return created;
}
