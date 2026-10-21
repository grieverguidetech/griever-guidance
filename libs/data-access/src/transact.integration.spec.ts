import { GetCommand, TransactWriteCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { systemClock, fixedClock } from './clock.js';
import { saveProfileFields, getProfile } from './items/profileItem.js';
import { profileKey } from './keys.js';
import { getLive } from './read.js';
import { runAction, transact, type ActionPlan } from './transact.js';
import { conflictDouble } from './testing/conflictDouble.js';
import { createTables, doc, dropTables, rawPut, required, table, up } from './testing/localTable.js';

/**
 * Needs DynamoDB Local (`pnpm aws:up`). CI sets AWS_LOCAL_REQUIRED=true so a missing stack fails.
 */
describe('local stack in CI', () => {
  it.runIf(required)('is reachable', () => {
    expect(up).toBe(true);
  });
});

const put = (id: string, extra: Record<string, unknown> = {}) => ({
  Put: { TableName: table, Item: { pk: `T#${id}`, sk: 'X', ...extra } },
});
const exists = (id: string) => doc.send(new GetCommand({ TableName: table, Key: { pk: `T#${id}`, sk: 'X' } }));
const bumpIf = (id: string, version: number) => ({
  Update: {
    TableName: table,
    Key: { pk: `T#${id}`, sk: 'X' },
    UpdateExpression: 'SET version = version + :one',
    ConditionExpression: 'version = :v',
    ExpressionAttributeValues: { ':one': 1, ':v': version },
  },
});

describe.runIf(up)('transact on DynamoDB Local', () => {
  beforeAll(createTables);
  afterAll(dropTables);

  it('reports the index of the failing condition and writes nothing', async () => {
    await rawPut({ pk: 'T#taken', sk: 'X' });
    const items = [
      put('a1'),
      put('a2'),
      { Put: { ...put('taken').Put, ConditionExpression: 'attribute_not_exists(pk)' } },
    ];
    expect(await transact(doc, items)).toEqual({ status: 'failed', failedIndex: 2 });
    expect((await exists('a1')).Item).toBeUndefined();
    expect(await transact(doc, [put('b1')])).toEqual({ status: 'ok' });
    expect((await exists('b1')).Item).toBeDefined();
  });

  it('reports CancellationReasons (the docs-check): the reasons array comes back with one code per item', async () => {
    await rawPut({ pk: 'T#reasons', sk: 'X' });
    const error = await doc
      .send(
        new TransactWriteCommand({
          TransactItems: [put('r1'), { Put: { ...put('reasons').Put, ConditionExpression: 'attribute_not_exists(pk)' } }],
        }),
      )
      .catch((e: unknown) => e as { name: string; CancellationReasons?: { Code?: string }[] });
    expect((error as { name: string }).name).toBe('TransactionCanceledException');
    expect((error as { CancellationReasons?: { Code?: string }[] }).CancellationReasons?.map((r) => r.Code)).toEqual([
      'None',
      'ConditionalCheckFailed',
    ]);
  });

  it('beforeCommit: the second writer wins and the first writer re-reads and sees it', async () => {
    await rawPut({ pk: 'T#race', sk: 'X', version: 0, winner: 'none' });
    const reads: number[] = [];
    const slow = async (attempt: number): Promise<ActionPlan<string>> => {
      const { Item } = await doc.send(new GetCommand({ TableName: table, Key: { pk: 'T#race', sk: 'X' }, ConsistentRead: true }));
      reads.push(Item?.['version'] as number);
      return { items: [bumpIf('race', Item?.['version'] as number)], value: `attempt ${attempt}`, retryOn: [0] };
    };
    const fast = () => runAction(doc, async () => ({ items: [bumpIf('race', 0)], value: 'fast' }));
    let interleaved = false;
    const result = await runAction(doc, slow, {
      beforeCommit: async () => {
        if (interleaved) return;
        interleaved = true;
        expect(await fast()).toEqual({ status: 'ok', value: 'fast' });
      },
    });
    expect(result).toEqual({ status: 'ok', value: 'attempt 2' });
    expect(reads).toEqual([0, 1]);
    expect((await exists('race')).Item?.['version']).toBe(2);
  });

  it('beforeCommit: without retryOn, the first writer sees its version condition fail', async () => {
    await rawPut({ pk: 'T#race2', sk: 'X', version: 0 });
    const result = await runAction(doc, async () => ({ items: [bumpIf('race2', 0)], value: 1 }), {
      beforeCommit: async () => {
        await transact(doc, [bumpIf('race2', 0)]);
      },
    });
    expect(result).toEqual({ status: 'failed', failedIndex: 0 });
    expect((await exists('race2')).Item?.['version']).toBe(1);
  });

  it('the conflict double: an action retries, then succeeds', async () => {
    const double = conflictDouble(doc, 2);
    let runs = 0;
    const result = await runAction(double, async () => {
      runs += 1;
      return { items: [put('retry-ok')], value: 'done' };
    });
    expect(result).toEqual({ status: 'ok', value: 'done' });
    expect(runs).toBe(3);
    expect((await exists('retry-ok')).Item).toBeDefined();
  });

  it('the conflict double: after 3 tries the result is busy and nothing is written', async () => {
    const double = conflictDouble(doc, 3);
    let runs = 0;
    const result = await runAction(double, async () => {
      runs += 1;
      return { items: [put('busy')], value: 'done' };
    });
    expect(result).toEqual({ status: 'busy' });
    expect(runs).toBe(3);
    expect(double.attempts).toBe(3);
    expect((await exists('busy')).Item).toBeUndefined();
  });

  it('rethrows errors that are not cancellations', async () => {
    await expect(transact(doc, [{ Put: { TableName: 'no-such-table', Item: { pk: 'x', sk: 'y' } } }])).rejects.toThrow();
  });

  it('saves and reads a profile, with accountType and version set once', async () => {
    const clock = fixedClock('2026-10-21T10:00:00.000Z');
    const first = await saveProfileFields(doc, table, 'user_p1', { senderName: 'Sam' }, clock);
    expect(first).toMatchObject({ userId: 'user_p1', senderName: 'Sam', accountType: 'owner', version: 0 });
    await doc.send(
      new UpdateCommand({
        TableName: table,
        Key: profileKey('user_p1'),
        UpdateExpression: 'SET accountType = :m, #v = :v',
        ExpressionAttributeNames: { '#v': 'version' },
        ExpressionAttributeValues: { ':m': 'member', ':v': 5 },
      }),
    );
    const later = await saveProfileFields(
      doc,
      table,
      'user_p1',
      { contactSource: 'import' },
      fixedClock('2026-10-22T10:00:00.000Z'),
    );
    expect(later).toMatchObject({
      senderName: 'Sam',
      contactSource: 'import',
      accountType: 'member',
      version: 5,
      createdAt: first.createdAt,
      updatedAt: '2026-10-22T10:00:00.000Z',
    });
    expect(await getProfile(doc, table, 'user_p1', systemClock)).toEqual(later);
  });

  it('hides an expired item on read', async () => {
    await rawPut({ ...profileKey('user_old'), ttl: 1 });
    expect(await getLive(doc, table, profileKey('user_old'), systemClock)).toBeUndefined();
  });
});
