import { act, renderHook, waitFor } from '@testing-library/react';
import type { AccountAuth, AccountTokenResult, Profile } from '@griever/shared';
import { SIGNED_IN_STORAGE_KEY, useAccount } from './useAccount.js';
import { PROFILE_STORAGE_KEY } from './accountCache.js';
import type { SendFlowStorage } from './useSendFlow.js';

const fetchMock = vi.fn();

function profile(senderName: string | null, id = 'u1'): Profile {
  return { id, senderName, contactSource: null, accountType: 'owner', createdAt: 'x', updatedAt: 'x' };
}

function reply(status: number, body: unknown = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function memoryStorage(seed: Record<string, string> = {}): SendFlowStorage & { data: Record<string, string> } {
  const data = { ...seed };
  return {
    data,
    getItem: (k) => data[k] ?? null,
    setItem: (k, v) => {
      data[k] = v;
    },
    removeItem: (k) => {
      delete data[k];
    },
  };
}

function fakeAuth(over: Partial<AccountAuth> = {}): AccountAuth {
  return {
    status: 'signed_in',
    userId: 'u1',
    getToken: async () => ({ ok: true, token: 'tok' }),
    signOut: async () => undefined,
    ...over,
  };
}

const UNREACHABLE = "We can't reach your account right now. Please try again in a little while.";
const NEEDS_CONNECTION = "You need a connection to do this. Nothing you've typed is lost.";

const cached = (id: string) =>
  JSON.stringify({ id, senderName: 'Peter', contactSource: null, accountType: 'owner' });

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (_url: string, init?: RequestInit) =>
    init?.method === 'PUT' ? reply(200, profile('Pete')) : reply(200, profile('Peter')),
  );
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useAccount boot', () => {
  it('is loading while the provider is loading, and makes no call', async () => {
    const { result } = renderHook(() => useAccount({ auth: fakeAuth({ status: 'loading', userId: null }) }));
    expect(result.current.isLoading).toBe(true);
    expect(result.current.isSignedIn).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('loads the profile, caches it, and writes the signed-in marker', async () => {
    const storage = memoryStorage();
    const { result } = renderHook(() => useAccount({ auth: fakeAuth(), storage }));
    expect(result.current.isSignedIn).toBe(true);
    await waitFor(() => expect(result.current.profile?.senderName).toBe('Peter'));
    expect(result.current.offline).toBe(false);
    expect(storage.data[SIGNED_IN_STORAGE_KEY]).toBe('u1');
    expect(JSON.parse(storage.data[PROFILE_STORAGE_KEY] as string)).toEqual({
      id: 'u1',
      senderName: 'Peter',
      contactSource: null,
      accountType: 'owner',
    });
  });

  it("never shows another user's cache, even on the first render", () => {
    const storage = memoryStorage({ [PROFILE_STORAGE_KEY]: cached('u2'), [SIGNED_IN_STORAGE_KEY]: 'u1' });
    fetchMock.mockImplementation(() => new Promise(() => undefined));
    const { result } = renderHook(() => useAccount({ auth: fakeAuth(), storage }));
    expect(result.current.profile).toBeNull();
  });

  it('ignores a cache with no signed-in marker on the first render', () => {
    const storage = memoryStorage({ [PROFILE_STORAGE_KEY]: cached('u1') });
    fetchMock.mockImplementation(() => new Promise(() => undefined));
    const { result } = renderHook(() => useAccount({ auth: fakeAuth(), storage }));
    expect(result.current.profile).toBeNull();
  });

  it('drops the previous user profile when the provider switches to another user', async () => {
    let auth = fakeAuth();
    const { result, rerender } = renderHook(() => useAccount({ auth }));
    await waitFor(() => expect(result.current.profile?.id).toBe('u1'));
    fetchMock.mockImplementation(() => new Promise(() => undefined));
    auth = fakeAuth({ userId: 'u2' });
    rerender();
    expect(result.current.profile).toBeNull();
  });

  it("discards another user's cache and never shows it", async () => {
    const storage = memoryStorage({ [PROFILE_STORAGE_KEY]: cached('someone-else') });
    fetchMock.mockImplementation(() => new Promise(() => undefined));
    const { result } = renderHook(() => useAccount({ auth: fakeAuth(), storage }));
    await waitFor(() => expect(result.current.profile).toBeNull());
    expect(storage.data[PROFILE_STORAGE_KEY]).toBeUndefined();
  });

  it('keeps this user cache while the profile loads', async () => {
    const storage = memoryStorage({ [PROFILE_STORAGE_KEY]: cached('u1'), [SIGNED_IN_STORAGE_KEY]: 'u1' });
    fetchMock.mockImplementation(() => new Promise(() => undefined));
    const { result } = renderHook(() => useAccount({ auth: fakeAuth(), storage }));
    expect(result.current.profile?.senderName).toBe('Peter');
  });

  it('a signed-out provider clears the cache and the marker', async () => {
    const storage = memoryStorage({ [PROFILE_STORAGE_KEY]: cached('u1'), [SIGNED_IN_STORAGE_KEY]: 'u1' });
    const { result } = renderHook(() => useAccount({ auth: fakeAuth({ status: 'signed_out', userId: null }), storage }));
    await waitFor(() => expect(result.current.profile).toBeNull());
    expect(result.current.status).toBe('signed_out');
    expect(storage.data).toEqual({});
  });

  it('treats a 404 as no profile yet, not an error', async () => {
    fetchMock.mockResolvedValue(reply(404, { error: 'none' }));
    const storage = memoryStorage({ [PROFILE_STORAGE_KEY]: cached('u1'), [SIGNED_IN_STORAGE_KEY]: 'u1' });
    const { result } = renderHook(() => useAccount({ auth: fakeAuth(), storage }));
    await waitFor(() => expect(result.current.profile).toBeNull());
    expect(result.current.error).toBeNull();
    expect(storage.data[PROFILE_STORAGE_KEY]).toBeUndefined();
  });

  it('keeps the cache and stays signed in on a 503', async () => {
    fetchMock.mockResolvedValue(reply(503, { error: 'down' }));
    const storage = memoryStorage({ [PROFILE_STORAGE_KEY]: cached('u1'), [SIGNED_IN_STORAGE_KEY]: 'u1' });
    const { result } = renderHook(() => useAccount({ auth: fakeAuth(), storage }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.isSignedIn).toBe(true);
    expect(result.current.profile?.senderName).toBe('Peter');
    expect(result.current.error).toBeNull();
  });

  it('picks up a provider that goes from loading to signed in', async () => {
    let auth = fakeAuth({ status: 'loading', userId: null });
    const { result, rerender } = renderHook(() => useAccount({ auth }));
    auth = fakeAuth();
    rerender();
    await waitFor(() => expect(result.current.profile?.senderName).toBe('Peter'));
    expect(result.current.isSignedIn).toBe(true);
  });
});

describe('useAccount offline (C5)', () => {
  it('a token offline result sets offline, keeps the user signed in and keeps the cache', async () => {
    const storage = memoryStorage({ [PROFILE_STORAGE_KEY]: cached('u1'), [SIGNED_IN_STORAGE_KEY]: 'u1' });
    const auth = fakeAuth({ getToken: async () => ({ ok: false, reason: 'offline' }) });
    const { result } = renderHook(() => useAccount({ auth, storage }));
    await waitFor(() => expect(result.current.offline).toBe(true));
    expect(result.current.isSignedIn).toBe(true);
    expect(result.current.profile?.senderName).toBe('Peter');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('a network failure on the profile call sets offline', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    const { result } = renderHook(() => useAccount({ auth: fakeAuth() }));
    await waitFor(() => expect(result.current.offline).toBe(true));
    expect(result.current.isSignedIn).toBe(true);
  });

  it('a save offline returns false with the connection message and sets offline', async () => {
    const auth = fakeAuth({ getToken: async () => ({ ok: false, reason: 'offline' }) });
    const { result } = renderHook(() => useAccount({ auth }));
    let saved = true;
    await act(async () => {
      saved = await result.current.updateSenderName('Pete');
    });
    expect(saved).toBe(false);
    expect(result.current.error).toBe(NEEDS_CONNECTION);
    expect(result.current.offline).toBe(true);
  });
});

describe('useAccount 401 handling', () => {
  it('retries once with a forced fresh token and uses that result', async () => {
    const getToken = vi.fn(async (options?: { forceRefresh?: boolean }): Promise<AccountTokenResult> => ({
      ok: true,
      token: options?.forceRefresh ? 'fresh' : 'old',
    }));
    fetchMock.mockImplementation(async (_url: string, init?: RequestInit) => {
      const header = (init?.headers as Record<string, string>)['Authorization'];
      return header === 'Bearer fresh' ? reply(200, profile('Peter')) : reply(401, { error: 'expired' });
    });
    const { result } = renderHook(() => useAccount({ auth: fakeAuth({ getToken }) }));
    await waitFor(() => expect(result.current.profile?.senderName).toBe('Peter'));
    expect(getToken).toHaveBeenCalledTimes(2);
    expect(getToken).toHaveBeenLastCalledWith({ forceRefresh: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.current.error).toBeNull();
  });

  it('a second 401 on boot never signs out and shows the unreachable copy', async () => {
    fetchMock.mockResolvedValue(reply(401, { error: 'no' }));
    const signOut = vi.fn(async () => undefined);
    const storage = memoryStorage({ [PROFILE_STORAGE_KEY]: cached('u1'), [SIGNED_IN_STORAGE_KEY]: 'u1' });
    const { result } = renderHook(() => useAccount({ auth: fakeAuth({ signOut }), storage }));
    await waitFor(() => expect(result.current.error).toBe(UNREACHABLE));
    expect(signOut).not.toHaveBeenCalled();
    expect(result.current.isSignedIn).toBe(true);
    expect(result.current.profile?.senderName).toBe('Peter');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('a second 401 on save never signs out, returns false and shows the unreachable copy', async () => {
    fetchMock.mockResolvedValue(reply(401, { error: 'no' }));
    const signOut = vi.fn(async () => undefined);
    const { result } = renderHook(() => useAccount({ auth: fakeAuth({ signOut }) }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    fetchMock.mockClear();
    let saved = true;
    await act(async () => {
      saved = await result.current.updateSenderName('Pete');
    });
    expect(saved).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(signOut).not.toHaveBeenCalled();
    expect(result.current.isSignedIn).toBe(true);
    expect(result.current.error).toBe(UNREACHABLE);
  });

  it('a refresh that cannot reach the network is offline, not an error', async () => {
    fetchMock.mockResolvedValue(reply(401, { error: 'no' }));
    const getToken = vi.fn(async (options?: { forceRefresh?: boolean }): Promise<AccountTokenResult> =>
      options?.forceRefresh ? { ok: false, reason: 'offline' } : { ok: true, token: 'old' },
    );
    const { result } = renderHook(() => useAccount({ auth: fakeAuth({ getToken }) }));
    await waitFor(() => expect(result.current.offline).toBe(true));
    expect(result.current.error).toBeNull();
    expect(result.current.isSignedIn).toBe(true);
  });
});

describe('useAccount updateSenderName', () => {
  it('saves, updates the profile and the cache, and returns true', async () => {
    const storage = memoryStorage();
    const { result } = renderHook(() => useAccount({ auth: fakeAuth(), storage }));
    await waitFor(() => expect(result.current.profile?.senderName).toBe('Peter'));
    let saved = false;
    await act(async () => {
      saved = await result.current.updateSenderName('Pete');
    });
    expect(saved).toBe(true);
    expect(result.current.profile?.senderName).toBe('Pete');
    expect(JSON.parse(storage.data[PROFILE_STORAGE_KEY] as string).senderName).toBe('Pete');
    const [, init] = fetchMock.mock.calls.at(-1) as [string, RequestInit];
    expect(init.method).toBe('PUT');
    expect(init.body).toBe(JSON.stringify({ senderName: 'Pete' }));
  });

  it('shows calm copy on a 400 and clearError removes it', async () => {
    const { result } = renderHook(() => useAccount({ auth: fakeAuth() }));
    await waitFor(() => expect(result.current.profile).not.toBeNull());
    fetchMock.mockResolvedValue(reply(400, { error: 'bad' }));
    await act(async () => {
      await result.current.updateSenderName('');
    });
    expect(result.current.error).toBe(UNREACHABLE);
    act(() => result.current.clearError());
    expect(result.current.error).toBeNull();
  });
});

describe('useAccount stale results', () => {
  it('drops a slow boot profile that finishes after sign-out', async () => {
    let release: (r: Response) => void = () => undefined;
    fetchMock.mockImplementation(() => new Promise<Response>((resolve) => (release = resolve)));
    const storage = memoryStorage();
    const { result } = renderHook(() => useAccount({ auth: fakeAuth(), storage }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await act(async () => {
      await result.current.signOut();
    });
    await act(async () => {
      release(reply(200, profile('Late')));
    });
    expect(result.current.profile).toBeNull();
    expect(storage.data).toEqual({});
  });

  it('drops a slow boot profile that finishes after a newer save', async () => {
    let release: (r: Response) => void = () => undefined;
    let first = true;
    fetchMock.mockImplementation((_url: string, init?: RequestInit) => {
      if (init?.method === 'PUT') {
        return Promise.resolve(reply(200, profile('Pete')));
      }
      if (first) {
        first = false;
        return new Promise<Response>((resolve) => (release = resolve));
      }
      return Promise.resolve(reply(200, profile('Peter')));
    });
    const { result } = renderHook(() => useAccount({ auth: fakeAuth() }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await act(async () => {
      await result.current.updateSenderName('Pete');
    });
    await act(async () => {
      release(reply(200, profile('Stale')));
    });
    expect(result.current.profile?.senderName).toBe('Pete');
  });
});

describe('useAccount signOut', () => {
  it('clears local state before the provider signOut resolves', async () => {
    const storage = memoryStorage();
    let finish: () => void = () => undefined;
    const signOut = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));
    const { result } = renderHook(() => useAccount({ auth: fakeAuth({ signOut }), storage }));
    await waitFor(() => expect(result.current.profile?.senderName).toBe('Peter'));
    let done = false;
    act(() => {
      void result.current.signOut().then(() => {
        done = true;
      });
    });
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(done).toBe(false);
    expect(result.current.profile).toBeNull();
    expect(result.current.status).toBe('signed_out');
    expect(storage.data).toEqual({});
    await act(async () => {
      finish();
    });
    expect(done).toBe(true);
  });

  it('clears an old error on sign-out', async () => {
    fetchMock.mockResolvedValue(reply(401, { error: 'no' }));
    const { result } = renderHook(() => useAccount({ auth: fakeAuth() }));
    await waitFor(() => expect(result.current.error).toBe(UNREACHABLE));
    await act(async () => {
      await result.current.signOut();
    });
    expect(result.current.error).toBeNull();
  });

  it('a good save clears offline', async () => {
    let online = false;
    const auth = fakeAuth({
      getToken: async () => (online ? { ok: true, token: 'tok' } : { ok: false, reason: 'offline' }),
    });
    const { result } = renderHook(() => useAccount({ auth }));
    await waitFor(() => expect(result.current.offline).toBe(true));
    online = true;
    await act(async () => {
      await result.current.updateSenderName('Pete');
    });
    expect(result.current.offline).toBe(false);
  });

  it('keeps the device signed out when the provider signOut rejects', async () => {
    const storage = memoryStorage();
    const signOut = vi.fn(async () => {
      throw new Error('offline');
    });
    const { result } = renderHook(() => useAccount({ auth: fakeAuth({ signOut }), storage }));
    await waitFor(() => expect(result.current.profile).not.toBeNull());
    await act(async () => {
      await result.current.signOut();
    });
    expect(result.current.status).toBe('signed_out');
    expect(result.current.profile).toBeNull();
    expect(storage.data).toEqual({});
  });

  it('swallows a rejected provider signOut', async () => {
    const signOut = vi.fn(async () => {
      throw new Error('network');
    });
    const { result } = renderHook(() => useAccount({ auth: fakeAuth({ signOut }) }));
    await act(async () => {
      await expect(result.current.signOut()).resolves.toBeUndefined();
    });
    expect(result.current.status).toBe('signed_out');
    expect(result.current.error).toBeNull();
  });
});
