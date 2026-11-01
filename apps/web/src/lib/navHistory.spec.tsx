import { act, renderHook } from '@testing-library/react';
import { useNavHistory } from './navHistory';
import type { NavSpot } from './navHistory';

const overview: NavSpot = { view: 'cms', section: 'overview', item: null, personId: 'p1' };
const service: NavSpot = { ...overview, section: 'service' };
const account: NavSpot = { view: 'profile', section: 'account', item: null, personId: 'p1' };

function mount(initial: NavSpot, enabled = true) {
  const onRestore = vi.fn((target: NavSpot): NavSpot | false => target);
  const hook = renderHook(
    (props: { spot: NavSpot; enabled: boolean; trackable?: boolean; userId?: string; signedOut?: boolean }) =>
      useNavHistory({ enabled: props.enabled, trackable: props.trackable ?? true, spot: props.spot, userId: props.userId ?? 'u1', signedOut: props.signedOut ?? false, onRestore }),
    { initialProps: { spot: initial, enabled } },
  );
  return { ...hook, onRestore };
}

function pop(state: unknown) {
  act(() => {
    window.dispatchEvent(new PopStateEvent('popstate', { state }));
  });
}

/** The state the hook wrote for the latest entry, as the browser would hand it back on a Back. */
function writtenState(spy: ReturnType<typeof vi.spyOn>) {
  return spy.mock.calls.at(-1)?.[0];
}

describe('useNavHistory (#566)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.sessionStorage.clear();
  });

  it('replaces the current entry for the first screen, so the sign-in entry is not kept', () => {
    const replace = vi.spyOn(window.history, 'replaceState');
    const push = vi.spyOn(window.history, 'pushState');
    mount(overview);
    expect(replace).toHaveBeenCalledTimes(1);
    expect(push).not.toHaveBeenCalled();
  });

  it('pushes an entry for each later move, and none for a repeat', () => {
    const push = vi.spyOn(window.history, 'pushState');
    const { rerender } = mount(overview);
    rerender({ spot: service, enabled: true });
    rerender({ spot: service, enabled: true });
    rerender({ spot: account, enabled: true });
    expect(push).toHaveBeenCalledTimes(2);
  });

  it('records nothing while signed out or on a screen outside the walk', () => {
    const replace = vi.spyOn(window.history, 'replaceState');
    const push = vi.spyOn(window.history, 'pushState');
    mount(overview, false);
    const hidden = renderHook(() => useNavHistory({ enabled: true, trackable: false, spot: overview, userId: 'u1', signedOut: false, onRestore: (target) => target }));
    hidden.unmount();
    expect(replace).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  it('restores the spot when Back lands on one of its entries, without pushing or going back again', () => {
    const push = vi.spyOn(window.history, 'pushState');
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => undefined);
    const replace = vi.spyOn(window.history, 'replaceState');
    const { onRestore, rerender } = mount(overview);
    const first = writtenState(replace);
    rerender({ spot: service, enabled: true });
    push.mockClear();
    pop(first);
    expect(onRestore).toHaveBeenCalledWith(overview);
    expect(push).not.toHaveBeenCalled();
    expect(back).not.toHaveBeenCalled();
  });

  it('goes Back again past an entry with no state of ours (a sign-in step), and never pushes', () => {
    const push = vi.spyOn(window.history, 'pushState');
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => undefined);
    const { onRestore } = mount(overview);
    push.mockClear();
    pop(null);
    pop({ other: 1 });
    expect(back).toHaveBeenCalledTimes(2);
    expect(push).not.toHaveBeenCalled();
    expect(onRestore).not.toHaveBeenCalled();
  });

  it('ignores entries that are malformed or written by an earlier sign-in, and walks past them', () => {
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => undefined);
    const replace = vi.spyOn(window.history, 'replaceState');
    const { onRestore } = mount(overview);
    const mine = writtenState(replace) as { ggNav: Record<string, unknown> };
    pop({ ggNav: { ...mine.ggNav, gen: 'an-older-sign-in' } });
    pop({ ggNav: { ...mine.ggNav, view: 7 } });
    pop({ ggNav: { ...mine.ggNav, personId: 7 } });
    expect(onRestore).not.toHaveBeenCalled();
    expect(back).toHaveBeenCalledTimes(3);
  });

  it('treats an entry onRestore refuses as foreign, and keeps the old record', () => {
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => undefined);
    const push = vi.spyOn(window.history, 'pushState');
    const replace = vi.spyOn(window.history, 'replaceState');
    const refuse = vi.fn((): NavSpot | false => false);
    const { rerender } = renderHook((props: { spot: NavSpot }) =>
      useNavHistory({ enabled: true, trackable: true, spot: props.spot, userId: 'u1', signedOut: false, onRestore: refuse }),
      { initialProps: { spot: overview } },
    );
    const mine = writtenState(replace);
    pop(mine);
    expect(refuse).toHaveBeenCalledTimes(1);
    expect(back).toHaveBeenCalledTimes(1);
    // Still recorded as overview: showing it again is not a new move.
    push.mockClear();
    rerender({ spot: overview });
    expect(push).not.toHaveBeenCalled();
  });

  it('when onRestore shows a fallback, records that spot on the entry and pushes nothing', () => {
    const push = vi.spyOn(window.history, 'pushState');
    const replace = vi.spyOn(window.history, 'replaceState');
    const people: NavSpot = { view: 'people', section: 'overview', item: null, personId: null };
    const onRestore = vi.fn((): NavSpot | false => people);
    const { rerender } = renderHook((props: { spot: NavSpot }) =>
      useNavHistory({ enabled: true, trackable: true, spot: props.spot, userId: 'u1', signedOut: false, onRestore }),
      { initialProps: { spot: overview } },
    );
    const first = writtenState(replace);
    rerender({ spot: service });
    push.mockClear();
    replace.mockClear();
    pop(first);
    expect(replace).toHaveBeenCalledTimes(1);
    expect((replace.mock.calls[0][0] as { ggNav: NavSpot }).ggNav).toMatchObject(people);
    rerender({ spot: people });
    expect(push).not.toHaveBeenCalled();
  });

  describe('the walk past the sign-in entries marks each entry it lands on (S8)', () => {
    function walkOf(replace: ReturnType<typeof vi.spyOn>) {
      return (replace.mock.calls.at(-1)?.[0] as { ggWalk?: { gen: string; pos: number } }).ggWalk;
    }

    it('marks unmarked entries -1, -2 in place and keeps going Back, however late the pops arrive', () => {
      const back = vi.spyOn(window.history, 'back').mockImplementation(() => undefined);
      const forward = vi.spyOn(window.history, 'forward').mockImplementation(() => undefined);
      const replace = vi.spyOn(window.history, 'replaceState');
      mount(overview);
      replace.mockClear();
      pop(null);
      expect(walkOf(replace)?.pos).toBe(-1);
      // A late pop: nothing here depends on how long it took.
      vi.useFakeTimers();
      act(() => {
        vi.advanceTimersByTime(5000);
      });
      vi.useRealTimers();
      pop(null);
      expect(walkOf(replace)?.pos).toBe(-2);
      expect(back).toHaveBeenCalledTimes(2);
      expect(forward).not.toHaveBeenCalled();
    });

    it('a pop to a marked entry lower than where we are goes Back; higher goes Forward until one of ours', () => {
      const back = vi.spyOn(window.history, 'back').mockImplementation(() => undefined);
      const forward = vi.spyOn(window.history, 'forward').mockImplementation(() => undefined);
      const replace = vi.spyOn(window.history, 'replaceState');
      const { onRestore } = mount(overview);
      const mine = writtenState(replace);
      const gen = (mine as { ggNav: { gen: string } }).ggNav.gen;
      const marked = (pos: number) => ({ ggWalk: { gen, pos } });
      pop(marked(-1));
      pop(marked(-2));
      expect(back).toHaveBeenCalledTimes(2);
      // The user now presses Forward: -1, then our entry.
      pop(marked(-1));
      expect(forward).toHaveBeenCalledTimes(1);
      pop(mine);
      expect(forward).toHaveBeenCalledTimes(1);
      expect(onRestore).toHaveBeenCalledWith(overview);
      expect(back).toHaveBeenCalledTimes(2);
    });

    it('a walk marker from another sign-in is not trusted: the entry counts as new and goes Back', () => {
      const back = vi.spyOn(window.history, 'back').mockImplementation(() => undefined);
      const forward = vi.spyOn(window.history, 'forward').mockImplementation(() => undefined);
      mount(overview);
      pop({ ggWalk: { gen: 'older', pos: -1 } });
      expect(back).toHaveBeenCalledTimes(1);
      expect(forward).not.toHaveBeenCalled();
    });

    it('after a pageshow from the back/forward cache on one of our entries, a pop to an unknown entry goes Back', () => {
      const back = vi.spyOn(window.history, 'back').mockImplementation(() => undefined);
      const forward = vi.spyOn(window.history, 'forward').mockImplementation(() => undefined);
      mount(overview);
      act(() => {
        window.dispatchEvent(Object.assign(new Event('pageshow'), { persisted: true }));
      });
      pop(null);
      expect(back).toHaveBeenCalledTimes(1);
      expect(forward).not.toHaveBeenCalled();
    });

    it('after a pageshow on a marked entry, Forward onto the marked entry above goes Forward, not Back', () => {
      const back = vi.spyOn(window.history, 'back').mockImplementation(() => undefined);
      const forward = vi.spyOn(window.history, 'forward').mockImplementation(() => undefined);
      const replace = vi.spyOn(window.history, 'replaceState');
      mount(overview);
      const gen = (writtenState(replace) as { ggNav: { gen: string } }).ggNav.gen;
      window.history.replaceState({ ggWalk: { gen, pos: -2 } }, '');
      act(() => {
        window.dispatchEvent(Object.assign(new Event('pageshow'), { persisted: true }));
      });
      pop({ ggWalk: { gen, pos: -1 } });
      expect(forward).toHaveBeenCalledTimes(1);
      expect(back).not.toHaveBeenCalled();
    });
  });

  it('stops going Back after a long run of foreign entries, so it can never loop', () => {
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => undefined);
    mount(overview);
    for (let i = 0; i < 80; i += 1) {
      pop(null);
    }
    expect(back.mock.calls.length).toBeLessThanOrEqual(50);
    expect(back.mock.calls.length).toBeGreaterThan(0);
  });

  it('ignores Back when disabled', () => {
    const push = vi.spyOn(window.history, 'pushState');
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => undefined);
    const { onRestore } = mount(overview, false);
    pop(null);
    expect(onRestore).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
    expect(back).not.toHaveBeenCalled();
  });

  describe('across a reload', () => {
    function firstLoad() {
      const replace = vi.spyOn(window.history, 'replaceState');
      const first = mount(overview, true);
      first.unmount();
      return writtenState(replace);
    }

    it('the same user keeps their earlier entries: Back restores the previous screen', () => {
      const earlier = firstLoad();
      const back = vi.spyOn(window.history, 'back').mockImplementation(() => undefined);
      const { onRestore } = mount(service, true);
      pop(earlier);
      expect(onRestore).toHaveBeenCalledWith(overview);
      expect(back).not.toHaveBeenCalled();
    });

    it('another user walks past the earlier entries', () => {
      const earlier = firstLoad();
      const back = vi.spyOn(window.history, 'back').mockImplementation(() => undefined);
      const other = vi.fn((target: NavSpot): NavSpot | false => target);
      renderHook(() => useNavHistory({ enabled: true, trackable: true, spot: service, userId: 'u2', signedOut: false, onRestore: other }));
      pop(earlier);
      expect(other).not.toHaveBeenCalled();
      expect(back).toHaveBeenCalledTimes(1);
    });

    it('a sign-out forgets the token, so the same user signing in again starts fresh', () => {
      const earlier = firstLoad();
      const gone = renderHook(() => useNavHistory({ enabled: false, trackable: true, spot: service, userId: '', signedOut: true, onRestore: (target) => target }));
      gone.unmount();
      const back = vi.spyOn(window.history, 'back').mockImplementation(() => undefined);
      const { onRestore } = mount(service, true);
      pop(earlier);
      expect(onRestore).not.toHaveBeenCalled();
      expect(back).toHaveBeenCalledTimes(1);
    });

    it('with storage that throws, each load gets its own token (today\'s behaviour)', () => {
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('blocked');
      });
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('blocked');
      });
      const earlier = firstLoad();
      const back = vi.spyOn(window.history, 'back').mockImplementation(() => undefined);
      const { onRestore } = mount(service, true);
      pop(earlier);
      expect(onRestore).not.toHaveBeenCalled();
      expect(back).toHaveBeenCalledTimes(1);
    });
  });
});
