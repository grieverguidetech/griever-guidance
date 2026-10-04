import { addDays, mergeSessionScreens, parseLooseDate, type SessionDocument } from './index.js';

describe('parseLooseDate', () => {
  it('parses what a family types and ISO dates', () => {
    expect(parseLooseDate('May 29, 2026')?.getFullYear()).toBe(2026);
    expect(parseLooseDate('2026-05-29')?.toISOString().slice(0, 10)).toBe('2026-05-29');
  });

  it('returns null for empty or unparseable input instead of an Invalid Date', () => {
    expect(parseLooseDate(undefined)).toBeNull();
    expect(parseLooseDate(null)).toBeNull();
    expect(parseLooseDate('  ')).toBeNull();
    expect(parseLooseDate('next Tuesday-ish')).toBeNull();
  });
});

describe('addDays', () => {
  it('does not mutate the input', () => {
    const start = new Date(2026, 0, 31);
    const later = addDays(start, 30);
    expect(start.getDate()).toBe(31);
    expect(later.getMonth()).toBe(2); // rolls past February
  });
});

describe('mergeSessionScreens', () => {
  const doc = (over: Partial<SessionDocument>): SessionDocument => ({
    schemaVersion: 1,
    sessionId: 's1',
    userId: 'u1',
    createdAt: 100,
    updatedAt: 100,
    lastOpenedAt: 100,
    status: 'in_progress',
    cursorScreen: 'setup',
    screens: {},
    ...over,
  });

  it('keeps the newer side of each screen independently', () => {
    const local = doc({
      updatedAt: 200,
      screens: {
        setup: { status: 'complete', values: { a: 'local' }, updatedAt: 300 },
        announce: { status: 'active', values: { b: 'local' }, updatedAt: 100 },
      },
    });
    const remote = doc({
      createdAt: 50,
      updatedAt: 400,
      status: 'sent',
      screens: {
        setup: { status: 'complete', values: { a: 'remote' }, updatedAt: 200 },
        announce: { status: 'complete', values: { b: 'remote' }, updatedAt: 200 },
      },
    });

    const merged = mergeSessionScreens(local, remote);
    expect(merged.screens['setup'].values).toEqual({ a: 'local' });
    expect(merged.screens['announce'].values).toEqual({ b: 'remote' });
    expect(merged.status).toBe('sent'); // scalars follow the newer document
    expect(merged.createdAt).toBe(100); // always the local createdAt
  });

  it('keeps screens that only one side has', () => {
    const local = doc({ screens: { a: { status: 'seen', updatedAt: 1 } } });
    const remote = doc({ screens: { b: { status: 'seen', updatedAt: 1 } } });
    expect(Object.keys(mergeSessionScreens(local, remote).screens).sort()).toEqual(['a', 'b']);
  });
});
