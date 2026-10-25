import { DeleteTableCommand } from '@aws-sdk/client-dynamodb';
import { PutCommand } from '@aws-sdk/lib-dynamodb';
import {
  createDocClient,
  createDynamoClient,
  ensureTables,
  isDynamoReachable,
  loadLocalConfig,
} from '@griever/data-aws';

/**
 * A random gg-data table on DynamoDB Local for one test file. `up` says whether DynamoDB Local
 * answers: use it with `describe.runIf(up)`. CI sets AWS_LOCAL_REQUIRED=true and checks `required`.
 */
const base = loadLocalConfig();
const suffix = Math.random().toString(36).slice(2, 8);
export const config = { ...base, dataTable: `gg-test-access-${suffix}`, contentTable: `gg-test-access-c-${suffix}` };
export const dynamo = createDynamoClient(config);
export const doc = createDocClient(dynamo);
export const up = await isDynamoReachable(dynamo);
export const required = process.env['AWS_LOCAL_REQUIRED'] === 'true';
export const table = config.dataTable;

export async function createTables(): Promise<void> {
  await ensureTables(dynamo, config);
}

export async function dropTables(): Promise<void> {
  for (const TableName of [config.dataTable, config.contentTable]) {
    await dynamo.send(new DeleteTableCommand({ TableName }));
  }
}

/** A raw put with no conditions: test setup only, standing in for a superuser. */
export async function rawPut(item: Record<string, unknown>): Promise<void> {
  await doc.send(new PutCommand({ TableName: table, Item: item }));
}
