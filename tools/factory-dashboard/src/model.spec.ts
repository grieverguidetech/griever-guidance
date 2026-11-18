import { describe, expect, it, vi } from 'vitest';
import { diagramAge, diagramGroup, extractMermaidBlocks, isOpenLinearState, linearReason, makeLinearReader, toLinearRows, LINEAR_AUTH_MESSAGE } from './model';

const FENCE = '```';
const block = (body = 'flowchart TD\n  A --> B'): string => `${FENCE}mermaid\n${body}\n${FENCE}`;

describe('extractMermaidBlocks', () => {
  it('uses the nearest heading above as the title and the fence line as the line', () => {
    const text = ['# Top', '', '## Sequence: sign-in', '', block()].join('\n');
    const [found] = extractMermaidBlocks('docs/a.md', text);
    expect(found).toEqual({ file: 'docs/a.md', line: 5, title: 'Sequence: sign-in', source: 'flowchart TD\n  A --> B' });
  });

  it('strips backticks from the title', () => {
    const [found] = extractMermaidBlocks('docs/a.md', ['## Sequence: `GET /me`', block()].join('\n'));
    expect(found?.title).toBe('Sequence: GET /me');
  });

  it('falls back to the file name when no heading is above', () => {
    expect(extractMermaidBlocks('docs/a.md', block())[0]?.title).toBe('docs/a');
  });

  it('numbers a second and third block under one heading', () => {
    const titles = extractMermaidBlocks('docs/a.md', ['## Same', block(), block(), '## Other', block()].join('\n')).map((b) => b.title);
    expect(titles).toEqual(['Same', 'Same (2)', 'Other']);
  });

  it('skips a block inside a 4-backtick fence', () => {
    const text = ['## Example', '````md', block(), '````', '', block('sequenceDiagram')].join('\n');
    const found = extractMermaidBlocks('docs/a.md', text);
    expect(found).toHaveLength(1);
    expect(found[0]?.source).toBe('sequenceDiagram');
  });

  it('reads CRLF files', () => {
    const text = ['## Windows', block()].join('\r\n');
    const [found] = extractMermaidBlocks('docs/a.md', text);
    expect(found?.title).toBe('Windows');
    expect(found?.source).toBe('flowchart TD\n  A --> B');
  });

  it('drops a block whose fence is never closed', () => {
    expect(extractMermaidBlocks('docs/a.md', ['## Open', `${FENCE}mermaid`, 'flowchart TD'].join('\n'))).toEqual([]);
  });

  it('does not treat #NoSpace as a heading', () => {
    const [found] = extractMermaidBlocks('docs/a.md', ['## Real', '#NoSpace', block()].join('\n'));
    expect(found?.title).toBe('Real');
  });

  it('ignores # lines inside front matter and other code fences', () => {
    const text = ['---', '# not a heading', '---', '## Real', `${FENCE}bash`, '# comment', FENCE, block()].join('\n');
    expect(extractMermaidBlocks('docs/a.md', text)[0]?.title).toBe('Real');
  });
});

describe('diagramGroup', () => {
  it('groups by file', () => {
    expect(diagramGroup('docs/frontend.md')).toBe('User flows');
    expect(diagramGroup('docs/learnings/aws-be.md')).toBe('Data');
    expect(diagramGroup('docs/backend-services.md')).toBe('System');
    expect(diagramGroup('docs/adr/0001-x.md')).toBe('System');
    expect(diagramGroup('docs/testflight.md')).toBe('System');
  });
});

describe('diagramAge', () => {
  const now = new Date('2026-11-18T12:00:00Z');
  const daysBefore = (n: number): string => new Date(now.getTime() - n * 86_400_000).toISOString();

  it('is not stale at 30 days and stale at 31', () => {
    expect(diagramAge(daysBefore(30), now)).toEqual({ days: 30, stale: false });
    expect(diagramAge(daysBefore(31), now)).toEqual({ days: 31, stale: true });
  });

  it('counts whole days and never goes below 0', () => {
    expect(diagramAge(daysBefore(0.5), now).days).toBe(0);
    expect(diagramAge(daysBefore(-2), now).days).toBe(0);
  });

  it('has no age when git gave no date', () => {
    expect(diagramAge(null, now)).toEqual({ days: null, stale: false });
    expect(diagramAge('not a date', now)).toEqual({ days: null, stale: false });
  });
});

describe('Linear helpers', () => {
  const node = (id: string, type: string, priority: number, updatedAt: string, assignee: string | null = null) => ({
    identifier: id,
    title: `Sample ${id}`,
    url: `https://linear.example/${id}`,
    state: { name: type === 'started' ? 'In Progress' : type, type },
    priority,
    priorityLabel: ['No priority', 'Urgent', 'High', 'Medium', 'Low'][priority],
    assignee: assignee ? { name: assignee } : null,
    updatedAt,
  });

  it('keeps open state types and drops completed and canceled', () => {
    expect(['backlog', 'unstarted', 'started', 'triage'].every(isOpenLinearState)).toBe(true);
    expect(isOpenLinearState('completed')).toBe(false);
    expect(isOpenLinearState('canceled')).toBe(false);
    expect(isOpenLinearState(undefined)).toBe(false);
  });

  it('sorts by priority with no priority last, then newest update first', () => {
    const rows = toLinearRows([
      node('X-1', 'started', 0, '2026-11-17T00:00:00Z'),
      node('X-2', 'started', 3, '2026-11-01T00:00:00Z'),
      node('X-3', 'started', 1, '2026-11-02T00:00:00Z'),
      node('X-4', 'started', 3, '2026-11-10T00:00:00Z'),
    ]);
    expect(rows.map((row) => row.identifier)).toEqual(['X-3', 'X-4', 'X-2', 'X-1']);
  });

  it('maps fields, shows Unassigned and drops closed issues', () => {
    const rows = toLinearRows([node('X-1', 'completed', 2, '2026-11-01T00:00:00Z'), node('X-2', 'started', 2, '2026-11-01T00:00:00Z', 'Sam')]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({
      identifier: 'X-2',
      title: 'Sample X-2',
      url: 'https://linear.example/X-2',
      status: 'In Progress',
      priority: 2,
      priorityLabel: 'High',
      assignee: 'Sam',
      updatedAt: '2026-11-01T00:00:00Z',
    });
    expect(toLinearRows([node('X-3', 'started', 0, '2026-11-01T00:00:00Z')])[0]?.assignee).toBe('Unassigned');
  });

  it('uses No priority for a missing label and drops a null state', () => {
    const noLabel = { ...node('X-1', 'started', 2, '2026-11-01T00:00:00Z'), priorityLabel: undefined };
    const noState = { ...node('X-2', 'started', 2, '2026-11-01T00:00:00Z'), state: null };
    const rows = toLinearRows([noLabel, noState]);
    expect(rows.map((row) => [row.identifier, row.priorityLabel])).toEqual([['X-1', 'No priority']]);
  });

  it('sorts a row with an unreadable date last within its priority', () => {
    const rows = toLinearRows([node('X-1', 'started', 2, 'not a date'), node('X-2', 'started', 2, '2026-01-01T00:00:00Z')]);
    expect(rows.map((row) => row.identifier)).toEqual(['X-2', 'X-1']);
  });

  it('rejects a reply that is not a list', () => {
    expect(() => toLinearRows(null)).toThrow('Unreadable reply');
  });

  it('removes the key from a reason', () => {
    const reason = linearReason('Bad header lin_api_SECRET123 and mykey-abc', 'mykey-abc');
    expect(reason).not.toContain('mykey-abc');
    expect(reason).not.toContain('SECRET123');
  });
});

describe('makeLinearReader', () => {
  const KEY = 'test-key-value';
  const page = (ids: string[], next: string | null) => ({
    status: 200,
    body: { data: { teams: { nodes: [{ issues: { nodes: ids.map((id) => ({ identifier: id, title: 't', url: 'https://x.example/' + id, state: { name: 'Todo', type: 'unstarted' }, priority: 1, priorityLabel: 'Urgent', assignee: null, updatedAt: '2026-11-01T00:00:00Z' })), pageInfo: { hasNextPage: next !== null, endCursor: next } } }] } } },
  });
  function setup(replies: (() => Promise<{ status: number; body: unknown }>)[]) {
    let time = 1_000_000;
    const post = vi.fn(async (_key: string, _vars: { after: string | null }, _signal: AbortSignal) => {
      const next = replies.shift();
      if (!next) {
        throw new Error('no more replies');
      }
      return next();
    });
    const reader = makeLinearReader({ readKey: async () => KEY, post, now: () => time });
    return { post, reader, advance: (ms: number) => { time += ms; } };
  }
  const ok = (ids: string[], next: string | null = null) => async () => page(ids, next);

  it('makes no call for a second read within 10 minutes, and calls again after', async () => {
    const { post, reader, advance } = setup([ok(['A-1']), ok(['A-2'])]);
    await reader();
    advance(9 * 60_000);
    expect((await reader()).rows[0]?.identifier).toBe('A-1');
    expect(post).toHaveBeenCalledTimes(1);
    advance(2 * 60_000);
    expect((await reader()).rows[0]?.identifier).toBe('A-2');
    expect(post).toHaveBeenCalledTimes(2);
  });

  it('does not cache a failure', async () => {
    const { post, reader } = setup([async () => ({ status: 500, body: null }), ok(['A-1'])]);
    await expect(reader()).rejects.toThrow('Could not read Linear: Linear answered 500');
    expect((await reader()).rows).toHaveLength(1);
    expect(post).toHaveBeenCalledTimes(2);
  });

  it('follows endCursor, stops on hasNextPage false and shares one signal', async () => {
    const { post, reader } = setup([ok(['A-1'], 'c1'), ok(['A-2'], 'c2'), ok(['A-3'])]);
    const result = await reader();
    expect(result.rows).toHaveLength(3);
    expect(result.truncated).toBe(false);
    expect(post.mock.calls.map((call) => call[1].after)).toEqual([null, 'c1', 'c2']);
    expect(new Set(post.mock.calls.map((call) => call[2])).size).toBe(1);
  });

  it('marks the read truncated at the page cap', async () => {
    const { post, reader } = setup(Array.from({ length: 10 }, (_, n) => ok([`A-${n}`], 'more')));
    const result = await reader();
    expect(post).toHaveBeenCalledTimes(10);
    expect(result.truncated).toBe(true);
  });

  it('passes on a GraphQL error message and Team GRI not found', async () => {
    const a = setup([async () => ({ status: 200, body: { errors: [{ message: 'Query too complex' }] } })]);
    await expect(a.reader()).rejects.toThrow('Could not read Linear: Query too complex');
    const b = setup([async () => ({ status: 200, body: { data: { teams: { nodes: [] } } } })]);
    await expect(b.reader()).rejects.toThrow('Could not read Linear: Team GRI not found');
  });

  it('maps an auth failure, including a 400 or 401 body', async () => {
    const a = setup([async () => ({ status: 401, body: { errors: [{ message: 'Authentication required', extensions: { code: 'AUTHENTICATION_ERROR' } }] } })]);
    await expect(a.reader()).rejects.toThrow(LINEAR_AUTH_MESSAGE);
    const b = setup([async () => ({ status: 400, body: { errors: [{ message: 'x', extensions: { code: 'AUTHENTICATION_ERROR' } }] } })]);
    await expect(b.reader()).rejects.toThrow(LINEAR_AUTH_MESSAGE);
  });

  it('does not leak the key from a thrown fetch error', async () => {
    const { reader } = setup([async () => { throw new Error(`failed with ${KEY}`); }]);
    const error = await reader().catch((e: Error) => e);
    expect((error as Error).message).not.toContain(KEY);
    expect((error as Error).message).toContain('Could not read Linear: failed with [removed]');
  });

  it('passes a key reader message through as is', async () => {
    const reader = makeLinearReader({ readKey: async () => { throw new Error('Linear key not set. See the README.'); }, post: vi.fn(), now: () => 1 });
    await expect(reader()).rejects.toThrow(/^Linear key not set. See the README.$/);
  });

  it('returns the last good rows with a note when a refresh fails', async () => {
    const { reader, advance } = setup([ok(['A-1']), async () => ({ status: 500, body: null })]);
    await reader();
    advance(11 * 60_000);
    const result = await reader();
    expect(result.rows).toHaveLength(1);
    expect(result.note).toBe('Could not refresh Linear: Linear answered 500. Showing the last good read.');
  });
});
