import { runAction, transact, backoffMs, type TransactClient } from './transact.js';
import { conflictDouble } from './testing/conflictDouble.js';

const item = { Put: { TableName: 't', Item: { pk: 'a', sk: 'b' } } };

function recorder(): TransactClient & { tokens: Array<string | undefined> } {
  const tokens: Array<string | undefined> = [];
  return {
    tokens,
    send: async (command) => {
      tokens.push((command as unknown as { input: { ClientRequestToken?: string } }).input.ClientRequestToken);
    },
  };
}

function cancelled(codes: string[]): TransactClient {
  return {
    send: async () => {
      throw Object.assign(new Error('cancelled'), {
        name: 'TransactionCanceledException',
        CancellationReasons: codes.map((Code) => ({ Code })),
      });
    },
  };
}

describe('transact', () => {
  it('sends a client request token', async () => {
    const client = recorder();
    await transact(client, [item]);
    expect(client.tokens[0]).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('rethrows a cancellation that is not a condition failure or conflict', async () => {
    await expect(transact(cancelled(['None', 'ThrottlingError']), [item])).rejects.toThrow('cancelled');
  });

  it('rethrows an error that is not a cancellation', async () => {
    const client: TransactClient = { send: async () => Promise.reject(new Error('boom')) };
    await expect(transact(client, [item])).rejects.toThrow('boom');
  });
});

describe('runAction', () => {
  it('uses a new token for each attempt, and the same token for a given attempt', async () => {
    const real = recorder();
    const double = conflictDouble(real, 2);
    const sent: Array<string | undefined> = [];
    const spy: TransactClient = {
      send: async (command) => {
        sent.push((command as unknown as { input: { ClientRequestToken?: string } }).input.ClientRequestToken);
        return double.send(command);
      },
    };
    const result = await runAction(spy, async () => ({ items: [item], value: 1 }), { sleep: async () => {} });
    expect(result).toEqual({ status: 'ok', value: 1 });
    expect(sent).toHaveLength(3);
    expect(sent.every((t) => typeof t === 'string')).toBe(true);
    expect(new Set(sent).size).toBe(3);
    expect(real.tokens).toEqual([sent[2]]);
  });

  it('waits 20 to 100 ms before attempts 2 and 3 only', async () => {
    const waits: number[] = [];
    const result = await runAction(conflictDouble(recorder(), 3), async () => ({ items: [item], value: 1 }), {
      sleep: async (ms) => {
        waits.push(ms);
      },
      random: () => 0.5,
    });
    expect(result).toEqual({ status: 'busy' });
    expect(waits).toEqual([60, 60]);
  });

  it('keeps the wait inside 20 to 99 ms', () => {
    expect(backoffMs(() => 0)).toBe(20);
    expect(backoffMs(() => 0.999999)).toBe(99);
  });

  it('does not wait when the first attempt works', async () => {
    const waits: number[] = [];
    await runAction(recorder(), async () => ({ items: [item], value: 1 }), { sleep: async (ms) => void waits.push(ms) });
    expect(waits).toEqual([]);
  });
});
