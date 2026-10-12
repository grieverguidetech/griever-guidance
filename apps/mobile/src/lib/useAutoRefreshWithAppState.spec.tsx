import { afterAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { AppState } from 'react-native';
import { render } from '@testing-library/react-native';
import type { AuthClient } from '@griever/api-client/auth';
import { useAutoRefreshWithAppState } from './useAutoRefreshWithAppState';

function Probe({ client }: { client: AuthClient | null }) {
  useAutoRefreshWithAppState(client);
  return null;
}

const makeClient = () =>
  ({
    startAutoRefresh: jest.fn(async () => undefined),
    stopAutoRefresh: jest.fn(async () => undefined),
  }) as unknown as AuthClient & { startAutoRefresh: jest.Mock; stopAutoRefresh: jest.Mock };

let listener: ((state: string) => void) | null;
const remove = jest.fn();

const realAddEventListener = AppState.addEventListener;
afterAll(() => {
  AppState.addEventListener = realAddEventListener;
});

beforeEach(() => {
  listener = null;
  remove.mockClear();
  // A fresh mock per test, so call counts never carry over.
  AppState.addEventListener = jest.fn((_: string, fn: (state: string) => void) => {
    listener = fn;
    return { remove };
  }) as never;
  Object.defineProperty(AppState, 'currentState', { value: 'active', configurable: true });
});

describe('useAutoRefreshWithAppState', () => {
  it('stops refresh in the background and restarts it on return', () => {
    const client = makeClient();
    render(<Probe client={client} />);
    listener?.('background');
    expect(client.stopAutoRefresh).toHaveBeenCalledTimes(1);
    listener?.('inactive');
    expect(client.stopAutoRefresh).toHaveBeenCalledTimes(2);
    listener?.('active');
    expect(client.startAutoRefresh).toHaveBeenCalledTimes(1);
  });

  it('subscribes once and removes the subscription on unmount', () => {
    const client = makeClient();
    const view = render(<Probe client={client} />);
    view.rerender(<Probe client={client} />);
    expect(AppState.addEventListener).toHaveBeenCalledTimes(1);
    view.unmount();
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it('pauses at mount when the app is not active', () => {
    Object.defineProperty(AppState, 'currentState', { value: 'background', configurable: true });
    const client = makeClient();
    render(<Probe client={client} />);
    expect(client.stopAutoRefresh).toHaveBeenCalledTimes(1);
    expect(client.startAutoRefresh).not.toHaveBeenCalled();
  });

  it('does nothing when there is no client (flag off)', () => {
    render(<Probe client={null} />);
    expect(AppState.addEventListener).not.toHaveBeenCalled();
  });
});
