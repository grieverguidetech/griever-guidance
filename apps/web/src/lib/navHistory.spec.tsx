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

  it('restores the spot when Back lands on one of its entries, without pushing again', () => {
    const push = vi.spyOn(window.history, 'pushState');
    const { onRestore } = mount(overview);
    pop({ ggNav: service });
    expect(onRestore).toHaveBeenCalledWith(service);
    expect(push).not.toHaveBeenCalled();
  });

  it('stays put when Back goes past its entries (the sign-in), by pushing the current spot again', () => {
    const push = vi.spyOn(window.history, 'pushState');
    const { onRestore } = mount(overview);
    pop(null);
    expect(onRestore).not.toHaveBeenCalled();
    expect(push).toHaveBeenCalledTimes(1);
    expect(push.mock.calls[0][0]).toEqual({ ggNav: overview });
  });

  it('ignores Back when disabled', () => {
    const push = vi.spyOn(window.history, 'pushState');
    const { onRestore } = mount(overview, false);
    pop(null);
    expect(onRestore).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });
});
