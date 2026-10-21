import { describe, expect, it } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { SendFlowStorage } from './useSendFlow.js';
import { INTRO_SEEN_KEY, markIntroSeen, useFirstVisitIntro } from './useFirstVisitIntro.js';

function memoryStorage(initial: Record<string, string> = {}): SendFlowStorage & {
  data: Record<string, string>;
} {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => {
      data[k] = v;
    },
    removeItem: (k) => {
      delete data[k];
    },
  };
}

describe('useFirstVisitIntro', () => {
  it('uses the gg. prefix key', () => {
    expect(INTRO_SEEN_KEY).toBe('gg.introSeen.v1');
  });

  it('shows with no flag and no people, and writes the flag at once', () => {
    const storage = memoryStorage();
    const { result } = renderHook(() => useFirstVisitIntro(storage, false));
    expect(result.current.showIntro).toBe(true);
    expect(storage.data[INTRO_SEEN_KEY]).toBe('1');
  });

  it('does not show with no flag but people, and writes the flag', () => {
    const storage = memoryStorage();
    const { result } = renderHook(() => useFirstVisitIntro(storage, true));
    expect(result.current.showIntro).toBe(false);
    expect(storage.data[INTRO_SEEN_KEY]).toBe('1');
  });

  it('does not show when the flag is set, whatever hasPeople is', () => {
    for (const hasPeople of [true, false]) {
      const storage = memoryStorage({ [INTRO_SEEN_KEY]: '1' });
      const { result } = renderHook(() => useFirstVisitIntro(storage, hasPeople));
      expect(result.current.showIntro).toBe(false);
    }
  });

  it('keeps showing across re-renders until dismissed, then a remount hides it', () => {
    const storage = memoryStorage();
    const { result, rerender } = renderHook(
      ({ people }) => useFirstVisitIntro(storage, people),
      { initialProps: { people: false } },
    );
    rerender({ people: false });
    expect(result.current.showIntro).toBe(true);
    rerender({ people: true });
    expect(result.current.showIntro).toBe(true);
    act(() => result.current.dismiss());
    expect(result.current.showIntro).toBe(false);

    const again = renderHook(() => useFirstVisitIntro(storage, false));
    expect(again.result.current.showIntro).toBe(false);
  });

  it('does not show, and does not throw, when getItem throws', () => {
    const storage: SendFlowStorage = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => undefined,
    };
    const { result } = renderHook(() => useFirstVisitIntro(storage, false));
    expect(result.current.showIntro).toBe(false);
    expect(() => result.current.markSeen()).not.toThrow();
  });

  it('does not show, and does not throw, with no storage', () => {
    const { result } = renderHook(() => useFirstVisitIntro(null, false));
    expect(result.current.showIntro).toBe(false);
    expect(() => result.current.markSeen()).not.toThrow();
  });

  it('markSeen saves the flag again after the device is wiped', () => {
    const storage = memoryStorage();
    const { result } = renderHook(() => useFirstVisitIntro(storage, true));
    storage.removeItem(INTRO_SEEN_KEY);
    act(() => result.current.markSeen());
    expect(storage.data[INTRO_SEEN_KEY]).toBe('1');
    // next visit shows Home, not the intro
    const next = renderHook(() => useFirstVisitIntro(storage, false));
    expect(next.result.current.showIntro).toBe(false);
  });

  it('markIntroSeen is safe with a throwing setItem', () => {
    expect(() =>
      markIntroSeen({ getItem: () => null, setItem: () => { throw new Error('full'); }, removeItem: () => undefined }),
    ).not.toThrow();
  });
});
