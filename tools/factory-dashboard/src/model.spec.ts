import { describe, expect, it } from 'vitest';
import { diagramAge, diagramGroup, extractMermaidBlocks } from './model';

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
