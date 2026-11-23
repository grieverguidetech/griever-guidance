import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { ScrollView, StyleSheet } from 'react-native';
import { act, render, screen } from '@testing-library/react-native';
import { screenCopy } from '@griever/copy';
import { announcePullSucceeded, registerManualPull } from './requestFlowPull';
import { usePullToRefresh } from './usePullToRefresh';

const failedLine = screenCopy('phoneRefresh').failed;

function Probe() {
  const refresh = usePullToRefresh('probe-status');
  return (
    <ScrollView testID="probe" refreshControl={refresh.refreshControl}>
      {refresh.notice}
    </ScrollView>
  );
}

const control = () => screen.getByTestId('probe').props.refreshControl as { props: { refreshing: boolean; onRefresh: () => void } } | undefined;

let stop: (() => void) | undefined;
afterEach(() => {
  stop?.();
  stop = undefined;
});

describe('usePullToRefresh', () => {
  it('offers no refresh control and no line when no pull is registered', () => {
    render(<Probe />);
    expect(control()).toBeUndefined();
    expect(screen.queryByText(failedLine)).toBeNull();
  });

  it('offers the control once a pull is registered, and drops it when sync is turned off', () => {
    render(<Probe />);
    act(() => {
      stop = registerManualPull(async () => true);
    });
    expect(control()).toBeDefined();
    act(() => {
      stop?.();
    });
    expect(control()).toBeUndefined();
  });

  it('spins until the pull ends, and says nothing when it works', async () => {
    let finish: (ok: boolean) => void = () => undefined;
    stop = registerManualPull(() => new Promise<boolean>((resolve) => (finish = resolve)));
    render(<Probe />);
    expect(control()?.props.refreshing).toBe(false);
    act(() => control()?.props.onRefresh());
    expect(control()?.props.refreshing).toBe(true);
    await act(async () => finish(true));
    expect(control()?.props.refreshing).toBe(false);
    expect(screen.queryByText(failedLine)).toBeNull();
  });

  it('stops the spinner and shows the calm line when the pull fails, then clears it on the next try', async () => {
    const pull = jest.fn(async () => false);
    stop = registerManualPull(pull);
    render(<Probe />);
    await act(async () => control()?.props.onRefresh());
    expect(control()?.props.refreshing).toBe(false);
    const line = screen.getByText(failedLine);
    expect(line.props.accessibilityLiveRegion).toBe('polite');
    expect(failedLine).not.toContain('!');
    pull.mockResolvedValueOnce(true);
    await act(async () => control()?.props.onRefresh());
    expect(screen.queryByText(failedLine)).toBeNull();
  });

  it('clears the failure line when any pull works, such as an automatic one', async () => {
    stop = registerManualPull(async () => false);
    render(<Probe />);
    await act(async () => control()?.props.onRefresh());
    expect(screen.getByText(failedLine)).toBeTruthy();
    act(() => announcePullSucceeded());
    expect(screen.queryByText(failedLine)).toBeNull();
  });

  it('keeps the live-region node mounted but out of the layout while empty, and in the layout when it fails', async () => {
    stop = registerManualPull(async () => false);
    render(<Probe />);
    const holder = () => screen.getByTestId('probe-status-holder').props.style;
    expect(JSON.stringify(StyleSheet.flatten(holder()))).toContain('"position":"absolute"');
    await act(async () => control()?.props.onRefresh());
    expect(JSON.stringify(StyleSheet.flatten(holder()) ?? null)).not.toContain('absolute');
  });
});
