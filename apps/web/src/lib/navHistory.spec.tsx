import { act, renderHook } from '@testing-library/react';
import { useNavHistory } from './navHistory';
import type { NavSpot } from './navHistory';

const overview: NavSpot = { view: 'cms', section: 'overview', item: null, personId: 'p1' };
const service: NavSpot = { ...overview, section: 'service' };
const account: NavSpot = { view: 'profile', section: 'account', item: null, personId: 'p1' };

function mount(initial: NavSpot, enabled = true) {
  const onRestore = vi.fn();
  const hook = renderHook(
    (props: { spot: NavSpot; enabled: boolean; trackable?: boolean }) =>
      useNavHistory({ enabled: props.enabled, trackable: props.trackable ?? true, spot: props.spot, onRestore }),
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
function writtenState(call: 'replaceState' | 'pushState', spy: ReturnType<typeof vi.spyOn>) {
  void call;
  return spy.mock.calls.at(-1)?.[0];
}

describe('useNavHistory (#566)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
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
    const hidden = renderHook(() => useNavHistory({ enabled: true, trackable: false, spot: overview, onRestore: vi.fn() }));
    hidden.unmount();
    expect(replace).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  it('restores the spot when Back lands on one of its entries, without pushing or going back again', () => {
    const push = vi.spyOn(window.history, 'pushState');
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => undefined);
    const replace = vi.spyOn(window.history, 'replaceState');
    const { onRestore, rerender } = mount(overview);
    const first = writtenState('replaceState', replace);
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
    const mine = writtenState('replaceState', replace) as { ggNav: Record<string, unknown> };
    pop({ ggNav: { ...mine.ggNav, gen: 'an-older-sign-in' } });
    pop({ ggNav: { ...mine.ggNav, view: 7 } });
    pop({ ggNav: { ...mine.ggNav, personId: 7 } });
    expect(onRestore).not.toHaveBeenCalled();
    expect(back).toHaveBeenCalledTimes(3);
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
});
