import { fixedClock } from './clock.js';
import { getLive, isLive, queryLive } from './read.js';

const clock = fixedClock('2026-10-21T12:00:00.000Z');
const nowSeconds = Date.parse('2026-10-21T12:00:00.000Z') / 1000;

type Input = { ConsistentRead?: boolean; ExclusiveStartKey?: unknown; ExpressionAttributeValues?: Record<string, unknown> };
type Cmd = { constructor: { name: string }; input: Input };

/** A fake document client that fails any read that is not consistent. */
function fakeDoc(pages: Array<{ Items: Record<string, unknown>[]; LastEvaluatedKey?: unknown }>) {
  const seen: Cmd[] = [];
  let next = 0;
  return {
    seen,
    send: async (command: Cmd) => {
      seen.push(command);
      expect(command.input.ConsistentRead).toBe(true);
      if (command.constructor.name === 'GetCommand') return { Item: pages[0]?.Items[0] };
      return pages[next++];
    },
  };
}

describe('ttl read filter', () => {
  it('drops items whose ttl is at or before now, and keeps later and missing ttl', () => {
    expect(isLive({ ttl: nowSeconds - 1 }, clock)).toBe(false);
    expect(isLive({ ttl: nowSeconds }, clock)).toBe(false);
    expect(isLive({ ttl: nowSeconds + 1 }, clock)).toBe(true);
    expect(isLive({}, clock)).toBe(true);
  });

  it('throws on a ttl in milliseconds', () => {
    expect(() => isLive({ ttl: nowSeconds * 1000 }, clock)).toThrow(/seconds/);
  });

  it('getLive hides an expired item and reads consistently', async () => {
    const doc = fakeDoc([{ Items: [{ id: 'old', ttl: nowSeconds - 10 }] }]);
    expect(await getLive(doc as never, 't', { pk: 'a', sk: 'b' }, clock)).toBeUndefined();
    expect(doc.seen).toHaveLength(1);
  });

  it('queryLive follows pages, reads consistently, filters, and builds the key from the user id', async () => {
    const doc = fakeDoc([
      { Items: [{ id: 'old', ttl: nowSeconds - 10 }, { id: 'a' }], LastEvaluatedKey: { pk: 'x', sk: 'y' } },
      { Items: [{ id: 'new', ttl: nowSeconds + 10 }] },
    ]);
    const live = await queryLive(doc as never, 't', 'u1', clock, 'FLOW#');
    expect(live.map((i) => i['id'])).toEqual(['a', 'new']);
    expect(doc.seen).toHaveLength(2);
    expect(doc.seen[0]?.input.ExpressionAttributeValues).toEqual({ ':pk': 'USER#u1', ':p': 'FLOW#' });
    expect(doc.seen[1]?.input.ExclusiveStartKey).toEqual({ pk: 'x', sk: 'y' });
  });

  it('queryLive refuses a user id that is not valid', async () => {
    await expect(queryLive(fakeDoc([]) as never, 't', 'a#b', clock)).rejects.toThrow();
  });
});
