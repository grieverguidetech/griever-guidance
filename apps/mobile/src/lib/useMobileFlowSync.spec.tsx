import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { renderHook } from '@testing-library/react-native';
import { AppState } from 'react-native';
import type { SyncAuth } from './AccountProvider';
import { useMobileFlowSync } from './useMobileFlowSync';

const mockUseFlowSync = jest.fn((_options: unknown) => ({ lastError: null }));
jest.mock('@griever/hooks', () => ({
  FLOW_QUEUE_STORAGE_KEY: 'gg.flowQueue.v1',
  flowQueueKey: (id: string) => `gg.flowQueue.v1:${id}`,
  useFlowSync: (options: unknown) => mockUseFlowSync(options),
}));

const mockFlags = { auth: true, sync: true };
jest.mock('./features', () => ({
  get AUTH_ENABLED() {
    return mockFlags.auth;
  },
  get SYNC_ENABLED() {
    return mockFlags.sync;
  },
}));

let mockAuth: SyncAuth | null = null;
jest.mock('./AccountProvider', () => ({ useSyncAuth: () => mockAuth }));

const signedIn: SyncAuth = { status: 'signed_in', userId: 'user_1', getToken: async () => 'tok' };
const storage = { getItem: () => null, setItem: () => undefined, removeItem: () => undefined };


function lastOptions(): { enabled: boolean; userId: string; subscribe: (cb: () => void) => () => void } {
  const calls = mockUseFlowSync.mock.calls;
  return calls[calls.length - 1][0] as ReturnType<typeof lastOptions>;
}

async function mount(flags: { auth: boolean; sync: boolean }, auth: SyncAuth | null) {
  mockAuth = auth;
  mockFlags.auth = flags.auth;
  mockFlags.sync = flags.sync;
  const view = renderHook(() => useMobileFlowSync({ sessions: [], applyRemoteFlows: jest.fn() as never, storage }));
  // Let the queue read finish.
  await new Promise((resolve) => setTimeout(resolve, 0));
  view.rerender({});
  return view;
}

beforeEach(() => {
  mockUseFlowSync.mockClear();
  mockAuth = null;
});

describe('useMobileFlowSync', () => {
  it('is enabled when sign-in and sync are on and someone is signed in', async () => {
    await mount({ auth: true, sync: true }, signedIn);
    expect(lastOptions()).toMatchObject({ enabled: true, userId: 'user_1' });
  });

  it('is disabled when sync is off', async () => {
    await mount({ auth: true, sync: false }, signedIn);
    expect(lastOptions().enabled).toBe(false);
  });

  it('is disabled when sign-in is off', async () => {
    await mount({ auth: false, sync: true }, signedIn);
    expect(lastOptions().enabled).toBe(false);
  });

  it('is disabled when signed out, loading, or accounts are unavailable', async () => {
    await mount({ auth: true, sync: true }, { ...signedIn, status: 'signed_out', userId: null });
    expect(lastOptions()).toMatchObject({ enabled: false, userId: '' });
    await mount({ auth: true, sync: true }, { ...signedIn, status: 'loading', userId: null });
    expect(lastOptions().enabled).toBe(false);
    await mount({ auth: true, sync: true }, null);
    expect(lastOptions().enabled).toBe(false);
  });

  it('wakes the sync when the app becomes active, and not for other states', async () => {
    const remove = jest.fn();
    let listener: (state: string) => void = () => undefined;
    jest.spyOn(AppState, 'addEventListener').mockImplementation(((_: string, cb: (state: string) => void) => {
      listener = cb;
      return { remove };
    }) as never);
    await mount({ auth: true, sync: true }, signedIn);
    const onWake = jest.fn();
    const unsubscribe = lastOptions().subscribe(onWake);
    listener('background');
    listener('inactive');
    expect(onWake).not.toHaveBeenCalled();
    listener('active');
    expect(onWake).toHaveBeenCalledTimes(1);
    unsubscribe();
    expect(remove).toHaveBeenCalledTimes(1);
  });
});
