import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, renderHook } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState } from 'react-native';
import type { SyncAuth } from './AccountProvider';
import { announceLeftFamily } from './leftFamily';
import { canPullNow, onPullSucceeded, pullNow, requestFlowPull } from './requestFlowPull';
import { useMobileFlowSync } from './useMobileFlowSync';

const mockPullCount = { value: 0 };
const mockPullNow = jest.fn(async () => true);
const mockFlushNow = jest.fn();
const mockUseFlowSync = jest.fn((_options: unknown) => ({ lastError: null, pulled: false, pullNow: mockPullNow, pullCount: mockPullCount.value, flushNow: mockFlushNow }));
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

type Options = {
  enabled: boolean;
  userId: string;
  subscribe: (cb: () => void) => () => void;
  storage: { getItem(key: string): string | null };
};

function lastOptions(): Options {
  const calls = mockUseFlowSync.mock.calls;
  return calls[calls.length - 1][0] as Options;
}

async function mount(flags: { auth: boolean; sync: boolean }, auth: SyncAuth | null) {
  mockAuth = auth;
  mockFlags.auth = flags.auth;
  mockFlags.sync = flags.sync;
  const view = renderHook(() => useMobileFlowSync({ sessions: [], applyRemoteFlows: jest.fn() as never, moveFlowId: jest.fn() as never, storage }));
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
  it('offers no pull until the account queue has been read (hydrate gap)', async () => {
    mockAuth = signedIn;
    mockFlags.auth = true;
    mockFlags.sync = true;
    let release: (value: string | null) => void = () => undefined;
    const spy = jest.spyOn(AsyncStorage, 'getItem').mockImplementation(() => new Promise<string | null>((resolve) => (release = resolve)));
    const view = renderHook(() => useMobileFlowSync({ sessions: [], applyRemoteFlows: jest.fn() as never, moveFlowId: jest.fn() as never, storage }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(lastOptions().enabled).toBe(false);
    expect(canPullNow()).toBe(false);
    await act(async () => release(null));
    view.rerender({});
    expect(lastOptions().enabled).toBe(true);
    expect(canPullNow()).toBe(true);
    view.unmount();
    spy.mockRestore();
  });

  it('tells screens when a pull has been applied', async () => {
    const heard = jest.fn();
    const stop = onPullSucceeded(heard);
    mockPullCount.value = 0;
    const view = await mount({ auth: true, sync: true }, signedIn);
    expect(heard).not.toHaveBeenCalled();
    mockPullCount.value = 1;
    view.rerender({});
    expect(heard).toHaveBeenCalledTimes(1);
    mockPullCount.value = 0;
    stop();
  });

  it('registers a pull a screen can wait for only while sync is allowed (#959)', async () => {
    const view = await mount({ auth: true, sync: true }, signedIn);
    expect(canPullNow()).toBe(true);
    await expect(pullNow()).resolves.toBe(true);
    expect(mockPullNow).toHaveBeenCalledTimes(1);
    view.unmount();
    expect(canPullNow()).toBe(false);
    await mount({ auth: true, sync: false }, signedIn);
    expect(canPullNow()).toBe(false);
    await mount({ auth: true, sync: true }, { ...signedIn, status: 'signed_out', userId: null });
    expect(canPullNow()).toBe(false);
  });

  it('passes moveFlowId through to the sync, so a squatted id can move (#942)', async () => {
    mockAuth = signedIn;
    const moveFlowId = jest.fn();
    renderHook(() => useMobileFlowSync({ sessions: [], applyRemoteFlows: jest.fn() as never, moveFlowId: moveFlowId as never, storage }));
    expect((lastOptions() as unknown as { moveFlowId: unknown }).moveFlowId).toBe(moveFlowId);
  });

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

  it('sends the queue at once when the app goes to the background or inactive, and not when it is active (#1079)', async () => {
    const listeners: Array<(state: string) => void> = [];
    jest.spyOn(AppState, 'addEventListener').mockImplementation(((_: string, cb: (state: string) => void) => {
      listeners.push(cb);
      return { remove: jest.fn() };
    }) as never);
    mockFlushNow.mockClear();
    await mount({ auth: true, sync: true }, signedIn);
    const emit = (state: string) => listeners.forEach((cb) => cb(state));
    emit('active');
    expect(mockFlushNow).not.toHaveBeenCalled();
    emit('background');
    expect(mockFlushNow).toHaveBeenCalledTimes(1);
    emit('inactive');
    expect(mockFlushNow).toHaveBeenCalledTimes(2);
  });

  it('does not listen for leaving the app while sync is off (#1079)', async () => {
    // The spy from earlier tests is reused, so clear its old calls first.
    const spy = jest.spyOn(AppState, 'addEventListener').mockImplementation((() => ({ remove: jest.fn() })) as never);
    spy.mockClear();
    await mount({ auth: true, sync: true }, { ...signedIn, status: 'signed_out', userId: null });
    expect(spy).not.toHaveBeenCalled();
  });

  it('stays disabled until this account\'s queue cache has been read', async () => {
    mockAuth = signedIn;
    mockFlags.auth = true;
    mockFlags.sync = true;
    const view = renderHook(() => useMobileFlowSync({ sessions: [], applyRemoteFlows: jest.fn() as never, moveFlowId: jest.fn() as never, storage }));
    expect(lastOptions().enabled).toBe(false);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(lastOptions().enabled).toBe(true);
    // A different account starts disabled again until its own cache is read.
    mockAuth = { ...signedIn, userId: 'user_2' };
    view.rerender({});
    expect(lastOptions()).toMatchObject({ userId: 'user_2', enabled: false });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(lastOptions()).toMatchObject({ userId: 'user_2', enabled: true });
  });

  it('serves the saved queue for the account and sends every other key to the session cache', async () => {
    await AsyncStorage.setItem('gg.flowQueue.v1:user_1', '{"queue":{}}');
    const base = { getItem: jest.fn((key: string) => (key === 'gg.sessions.v1' ? '[]' : null)), setItem: jest.fn(), removeItem: jest.fn() };
    mockAuth = signedIn;
    mockFlags.auth = true;
    mockFlags.sync = true;
    renderHook(() => useMobileFlowSync({ sessions: [], applyRemoteFlows: jest.fn() as never, moveFlowId: jest.fn() as never, storage: base }));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    const joined = lastOptions().storage;
    expect(joined.getItem('gg.flowQueue.v1:user_1')).toBe('{"queue":{}}');
    expect(base.getItem).not.toHaveBeenCalledWith('gg.flowQueue.v1:user_1');
    expect(joined.getItem('gg.sessions.v1')).toBe('[]');
    expect(base.getItem).toHaveBeenCalledWith('gg.sessions.v1');
  });
});

describe('useMobileFlowSync: after a member leaves (#224)', () => {
  it('drops the shared people at once and asks the sync for a pull, for the signed-in account only', async () => {
    mockAuth = signedIn;
    mockFlags.auth = true;
    mockFlags.sync = true;
    const applyRemoteFlows = jest.fn();
    renderHook(() => useMobileFlowSync({ sessions: [], applyRemoteFlows: applyRemoteFlows as never, moveFlowId: jest.fn() as never, storage }));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    const onWake = jest.fn();
    lastOptions().subscribe(onWake);

    announceLeftFamily('someone_else');
    expect(applyRemoteFlows).not.toHaveBeenCalled();
    expect(onWake).not.toHaveBeenCalled();

    announceLeftFamily('user_1');
    expect(applyRemoteFlows).toHaveBeenCalledTimes(1);
    expect(applyRemoteFlows).toHaveBeenCalledWith({ flows: [] }, 'user_1');
    expect(onWake).toHaveBeenCalledTimes(1);
  });

  it('stops listening when the hook unmounts', async () => {
    mockAuth = signedIn;
    mockFlags.auth = true;
    mockFlags.sync = true;
    const applyRemoteFlows = jest.fn();
    const view = renderHook(() => useMobileFlowSync({ sessions: [], applyRemoteFlows: applyRemoteFlows as never, moveFlowId: jest.fn() as never, storage }));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    view.unmount();
    announceLeftFamily('user_1');
    expect(applyRemoteFlows).not.toHaveBeenCalled();
  });
});

describe('useMobileFlowSync: a send screen asks for a pull (#949)', () => {
  it('wakes the sync when allowed, and stops after unmount', async () => {
    const view = await mount({ auth: true, sync: true }, signedIn);
    const onWake = jest.fn();
    lastOptions().subscribe(onWake);
    requestFlowPull();
    expect(onWake).toHaveBeenCalledTimes(1);
    view.unmount();
    requestFlowPull();
    expect(onWake).toHaveBeenCalledTimes(1);
  });

  it('makes no request when sync is off or no one is signed in', async () => {
    const off = await mount({ auth: true, sync: false }, signedIn);
    const offWake = jest.fn();
    lastOptions().subscribe(offWake);
    requestFlowPull();
    expect(offWake).not.toHaveBeenCalled();
    off.unmount();

    const out = await mount({ auth: true, sync: true }, { status: 'signed_out' } as SyncAuth);
    const outWake = jest.fn();
    lastOptions().subscribe(outWake);
    requestFlowPull();
    expect(outWake).not.toHaveBeenCalled();
    out.unmount();
  });
});
