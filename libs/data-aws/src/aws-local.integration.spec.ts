import { DeleteTableCommand } from '@aws-sdk/client-dynamodb';
import { GetCommand, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { createDocClient, createDynamoClient, createSesClient } from './clients.js';
import { loadLocalConfig } from './config.js';
import { buildContent } from './content.js';
import { seedContent } from './seed.js';
import { clearSentEmails, isSesReachable, readSentEmails, sendTextEmail } from './ses.js';
import { ensureTables } from './tables.js';
import { isDynamoReachable } from './wait.js';

/**
 * These tests need the local stack (`pnpm aws:up`). They run whenever it answers.
 * When it does not answer, they do not run, and a CI run must say so: CI sets
 * AWS_LOCAL_REQUIRED=true, and then the "stack is reachable" test below fails instead.
 */
const base = loadLocalConfig();
// Unique table names, so a run never touches the tables that `pnpm aws:seed` made.
const suffix = Math.random().toString(36).slice(2, 8);
const config = { ...base, dataTable: `gg-test-data-${suffix}`, contentTable: `gg-test-content-${suffix}` };
const dynamo = createDynamoClient(config);
const doc = createDocClient(dynamo);
const dynamoUp = await isDynamoReachable(dynamo);
const sesUp = await isSesReachable(base.sesEndpoint as string);
const required = process.env['AWS_LOCAL_REQUIRED'] === 'true';

describe('local stack in CI', () => {
  it.runIf(required)('is reachable (DynamoDB Local and the SES stand-in)', () => {
    expect({ dynamoUp, sesUp }).toEqual({ dynamoUp: true, sesUp: true });
  });
});

describe.runIf(dynamoUp)('DynamoDB Local', () => {
  afterAll(async () => {
    for (const TableName of [config.dataTable, config.contentTable]) {
      await dynamo.send(new DeleteTableCommand({ TableName }));
    }
  });

  it('creates the tables, and a second run creates nothing', async () => {
    expect(await ensureTables(dynamo, config)).toEqual([config.dataTable, config.contentTable]);
    expect(await ensureTables(dynamo, config)).toEqual([]);
  });

  it('writes and reads one item in the data table', async () => {
    const Item = { pk: 'USER#u1', sk: 'PROFILE', gsi1pk: 'EMAIL#a@example.test', gsi1sk: 'USER#u1', version: 1 };
    await doc.send(new PutCommand({ TableName: config.dataTable, Item }));
    const got = await doc.send(
      new GetCommand({ TableName: config.dataTable, Key: { pk: 'USER#u1', sk: 'PROFILE' } }),
    );
    expect(got.Item).toEqual(Item);
  });

  it('finds an item through the gsi1 index', async () => {
    const found = await doc.send(
      new QueryCommand({
        TableName: config.dataTable,
        IndexName: 'gsi1',
        KeyConditionExpression: 'gsi1pk = :e',
        ExpressionAttributeValues: { ':e': 'EMAIL#a@example.test' },
      }),
    );
    expect(found.Items?.map((i) => i['pk'])).toEqual(['USER#u1']);
  });

  it('seeds the content and reads a checklist item and a sample back', async () => {
    const count = await seedContent(doc, config);
    expect(count).toBe(buildContent().length);
    const checklist = await doc.send(
      new QueryCommand({
        TableName: config.contentTable,
        KeyConditionExpression: 'kind = :k',
        ExpressionAttributeValues: { ':k': 'checklist' },
      }),
    );
    expect(checklist.Items?.map((i) => i['id'])).toContain('ssn-and-id');
    const sample = await doc.send(
      new GetCommand({ TableName: config.contentTable, Key: { kind: 'sample', id: 'thank-you' } }),
    );
    expect(sample.Item?.['text']).toContain('thank you');
  });
});

describe.runIf(sesUp)('SES stand-in', () => {
  it('keeps a sent email so a test can read it back', async () => {
    const endpoint = base.sesEndpoint as string;
    await clearSentEmails(endpoint);
    const id = await sendTextEmail(createSesClient(base), {
      from: 'alerts@example.test',
      to: 'owner@example.test',
      subject: 'A new account was created',
      text: 'Accounts: 1',
    });
    const emails = await readSentEmails(endpoint);
    const sent = emails.find((e) => e.messageId === id);
    expect(sent?.destination.to).toEqual(['owner@example.test']);
    expect(sent?.subject).toBe('A new account was created');
    expect(sent?.body.text).toBe('Accounts: 1');
  });
});
