import { addDays, formatPassingDate, passingDateFromText, mergeSessionScreens, parseCompleteDate, parseLooseDate, type SessionDocument } from './index.js';

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

describe('parseCompleteDate', () => {
  const ymd = (d: Date | null) => d && [d.getFullYear(), d.getMonth() + 1, d.getDate()];

  it('parses complete dates in the formats the app produces', () => {
    expect(ymd(parseCompleteDate('May 29, 2026'))).toEqual([2026, 5, 29]);
    expect(ymd(parseCompleteDate('2026-05-29'))).toEqual([2026, 5, 29]);
    expect(ymd(parseCompleteDate('5/29/2026'))).toEqual([2026, 5, 29]);
    expect(ymd(parseCompleteDate('  September 5, 2026 '))).toEqual([2026, 9, 5]);
    expect(ymd(parseCompleteDate('Sept. 5 2026'))).toEqual([2026, 9, 5]);
    expect(ymd(parseCompleteDate('dec 1, 2000'))).toEqual([2000, 12, 1]);
    expect(ymd(parseCompleteDate('12/31/2100'))).toEqual([2100, 12, 31]);
  });

  it.each(['6', '6/12', 'May 2', 'May 29, 2', 'May 29, 202', 'May 29,', 'May', '2026', '2026-05', '2026-05-2', '5/29/26'])(
    'is null for the partial input %j that parseLooseDate wrongly accepts',
    (input) => {
      expect(parseCompleteDate(input)).toBeNull();
    },
  );

  it('is null for every prefix of a date typed one character at a time, except the full value', () => {
    for (const full of ['May 29, 2026', '5/29/2026', '2026-05-29']) {
      for (let i = 0; i < full.length; i++) {
        expect(parseCompleteDate(full.slice(0, i))).toBeNull();
      }
      expect(parseCompleteDate(full)).not.toBeNull();
    }
  });

  it('is null for years outside 2000-2100 and for impossible dates', () => {
    expect(parseCompleteDate('May 29, 1999')).toBeNull();
    expect(parseCompleteDate('May 29, 2101')).toBeNull();
    expect(parseCompleteDate('May 29, 0202')).toBeNull();
    expect(parseCompleteDate('1999-12-31')).toBeNull();
    expect(parseCompleteDate('13/1/2026')).toBeNull();
    expect(parseCompleteDate('2/30/2026')).toBeNull();
    expect(parseCompleteDate('2026-02-30')).toBeNull();
    expect(parseCompleteDate('Foo 5, 2026')).toBeNull();
    expect(parseCompleteDate('Tuesday, June 10 at 11:00 AM')).toBeNull();
  });

  it('is null for empty input', () => {
    expect(parseCompleteDate(undefined)).toBeNull();
    expect(parseCompleteDate(null)).toBeNull();
    expect(parseCompleteDate('  ')).toBeNull();
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

describe('formatPassingDate / passingDateFromText', () => {
  it('writes a picked date the way the session stores it', () => {
    expect(formatPassingDate(new Date(2025, 5, 7))).toBe('June 7, 2025');
    expect(formatPassingDate(new Date(2026, 0, 1))).toBe('January 1, 2026');
    expect(formatPassingDate(new Date(2024, 11, 31, 23, 59))).toBe('December 31, 2024');
  });

  it('reads a stored date back into the date the picker opens on', () => {
    const back = passingDateFromText('June 7, 2025');
    expect([back?.getFullYear(), back?.getMonth(), back?.getDate()]).toEqual([2025, 5, 7]);
    const iso = passingDateFromText('2026-05-29');
    expect([iso?.getFullYear(), iso?.getMonth(), iso?.getDate()]).toEqual([2026, 4, 29]);
  });

  it('gives null for empty or free text, so the picker opens on today', () => {
    expect(passingDateFromText('')).toBeNull();
    expect(passingDateFromText('last Tuesday')).toBeNull();
    expect(passingDateFromText(undefined)).toBeNull();
  });

  it('round-trips', () => {
    const date = new Date(2023, 8, 15);
    expect(formatPassingDate(passingDateFromText(formatPassingDate(date)) as Date)).toBe('September 15, 2023');
  });
});
