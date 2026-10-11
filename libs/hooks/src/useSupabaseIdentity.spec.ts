import { act, renderHook, waitFor } from '@testing-library/react';
import type { AuthClient, ProfileResult, SessionState } from '@griever/api-client/auth';
import type { Profile } from '@griever/shared';
import { PROFILE_STORAGE_KEY, identityErrorMessage, useSupabaseIdentity } from './useSupabaseIdentity.js';
import type { SendFlowStorage } from './useSendFlow.js';

const signedIn: SessionState = {
  status: 'signed_in',
  session: { userId: 'u1', email: 'a@b.c', accessToken: 'tok' },
};

function profile(senderName: string | null): Profile {
  return { id: 'u1', senderName, contactSource: null, createdAt: 'x', updatedAt: 'x' };
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

function stubClient(over: Partial<AuthClient> = {}): AuthClient {
  return {
    signUp: async () => ({ ok: true, userId: 'u1' }),
    signIn: async () => ({ ok: true, userId: 'u1' }),
    signOut: async () => ({ ok: true, serverRevoked: true }),
    getSession: async () => signedIn,
    refreshSession: async () => signedIn,
    getProfile: async () => ({ ok: true, profile: profile('Peter') }),
    updateProfile: async () => ({ ok: true, profile: profile('Pete') }),
    ...over,
  };
}

const cached = JSON.stringify({ senderName: 'Peter', contactSource: null });

describe('useSupabaseIdentity boot', () => {
  it('is loading only until the first check resolves, then signed in with the profile', async () => {
    const storage = memoryStorage();
    const { result } = renderHook(() => useSupabaseIdentity({ client: stubClient(), storage }));
    expect(result.current.isLoading).toBe(true);
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isSignedIn).toBe(true);
    await waitFor(() => expect(result.current.profile?.senderName).toBe('Peter'));
    expect(result.current.offline).toBe(false);
    expect(JSON.parse(storage.data[PROFILE_STORAGE_KEY])).toEqual({ senderName: 'Peter', contactSource: null });
  });

  it('keeps the user signed in and shows the cached name when offline', async () => {
    const storage = memoryStorage({ [PROFILE_STORAGE_KEY]: cached });
    const getProfile = vi.fn();
    const client = stubClient({ getSession: async () => ({ status: 'offline' }), getProfile });
    const { result } = renderHook(() => useSupabaseIdentity({ client, storage }));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isSignedIn).toBe(true);
    expect(result.current.offline).toBe(true);
    expect(result.current.profile?.senderName).toBe('Peter');
    expect(storage.data[PROFILE_STORAGE_KEY]).toBe(cached);
    expect(getProfile).not.toHaveBeenCalled();
  });

  it('is signed out when there is no session, and clears any stale cache', async () => {
    const storage = memoryStorage({ [PROFILE_STORAGE_KEY]: cached });
    const client = stubClient({ getSession: async () => ({ status: 'signed_out' }) });
    const { result } = renderHook(() => useSupabaseIdentity({ client, storage }));
    await waitFor(() => expect(result.current.status).toBe('signed_out'));
    expect(result.current.profile).toBeNull();
    expect(storage.data[PROFILE_STORAGE_KEY]).toBeUndefined();
  });

  it.each(['unavailable', 'failed', 'offline', 'invalid'] as const)(
    'does not sign out or drop the cached profile when the profile call returns %s (C5)',
    async (reason) => {
      const storage = memoryStorage({ [PROFILE_STORAGE_KEY]: cached });
      const getProfile = vi.fn(async (): Promise<ProfileResult> => ({ ok: false, reason }));
      const client = stubClient({ getProfile });
      const { result } = renderHook(() => useSupabaseIdentity({ client, storage }));
      await waitFor(() => expect(getProfile).toHaveBeenCalled());
      await act(async () => {});
      expect(result.current.isSignedIn).toBe(true);
      if (reason === 'offline') expect(result.current.offline).toBe(true);
      expect(result.current.profile?.senderName).toBe('Peter');
      expect(result.current.error).toBeNull();
      expect(storage.data[PROFILE_STORAGE_KEY]).toBe(cached);
    },
  );

  it('clears state when the profile call returns signed_out', async () => {
    const storage = memoryStorage({ [PROFILE_STORAGE_KEY]: cached });
    const client = stubClient({
      getProfile: async () => ({ ok: false, reason: 'signed_out' }),
      refreshSession: async () => ({ status: 'signed_out' }),
    });
    const { result } = renderHook(() => useSupabaseIdentity({ client, storage }));
    await waitFor(() => expect(result.current.status).toBe('signed_out'));
    expect(result.current.profile).toBeNull();
    expect(storage.data[PROFILE_STORAGE_KEY]).toBeUndefined();
  });

  it('treats no_profile as a normal state, not an error', async () => {
    const storage = memoryStorage();
    const getProfile = vi.fn(async (): Promise<ProfileResult> => ({ ok: false, reason: 'no_profile' }));
    const { result } = renderHook(() => useSupabaseIdentity({ client: stubClient({ getProfile }), storage }));
    await waitFor(() => expect(getProfile).toHaveBeenCalled());
    await act(async () => {});
    expect(result.current.isSignedIn).toBe(true);
    expect(result.current.profile).toBeNull();
    expect(result.current.error).toBeNull();
  });
});

describe('useSupabaseIdentity actions', () => {
  async function ready(client: AuthClient, storage = memoryStorage()) {
    const hook = renderHook(() => useSupabaseIdentity({ client, storage }));
    await waitFor(() => expect(hook.result.current.isLoading).toBe(false));
    await act(async () => {});
    return hook;
  }

  const signUpCopy = {
    email_taken: 'This email already has an account. Sign in instead.',
    weak_password: 'Please choose a stronger password.',
    rate_limited: 'Too many tries. Please wait a few minutes and try again.',
    offline: "You need a connection to do this. Nothing you've typed is lost.",
    unavailable: "We can't reach your account right now. Please try again in a little while.",
    failed: "We can't reach your account right now. Please try again in a little while.",
  } as const;

  it.each(Object.entries(signUpCopy))('signUp %s shows its copy', async (reason, copy) => {
    const client = stubClient({
      getSession: async () => ({ status: 'signed_out' }),
      signUp: async () => ({ ok: false, reason: reason as keyof typeof signUpCopy }),
    });
    const { result } = await ready(client);
    let ok = true;
    await act(async () => {
      ok = await result.current.signUp('a@b.c', 'pw');
    });
    expect(ok).toBe(false);
    expect(result.current.error).toBe(copy);
    expect(result.current.error).not.toContain('!');
  });

  const signInCopy = {
    invalid_credentials: "That email and password don't match. Please try again.",
    email_not_confirmed: 'Please check your email to finish setting up your account.',
    rate_limited: 'Too many tries. Please wait a few minutes and try again.',
    offline: "You need a connection to do this. Nothing you've typed is lost.",
    unavailable: "We can't reach your account right now. Please try again in a little while.",
    failed: "We can't reach your account right now. Please try again in a little while.",
  } as const;

  it.each(Object.entries(signInCopy))('signIn %s shows its copy', async (reason, copy) => {
    const client = stubClient({
      getSession: async () => ({ status: 'signed_out' }),
      signIn: async () => ({ ok: false, reason: reason as keyof typeof signInCopy }),
    });
    const { result } = await ready(client);
    let ok = true;
    await act(async () => {
      ok = await result.current.signIn('a@b.c', 'pw');
    });
    expect(ok).toBe(false);
    expect(result.current.error).toBe(copy);
    expect(result.current.status).toBe('signed_out');
  });

  it('signIn success signs in, loads the profile, and clears an earlier error', async () => {
    let signedInNow = false;
    const client = stubClient({
      getSession: async () => (signedInNow ? signedIn : { status: 'signed_out' }),
      signIn: async () => {
        signedInNow = true;
        return { ok: true, userId: 'u1' };
      },
    });
    const { result } = await ready(client);
    let ok = false;
    await act(async () => {
      ok = await result.current.signIn('a@b.c', 'pw');
    });
    expect(ok).toBe(true);
    await act(async () => {});
    expect(result.current.isSignedIn).toBe(true);
    expect(result.current.profile?.senderName).toBe('Peter');
    expect(result.current.error).toBeNull();
  });

  it('signUp with email confirmation succeeds but stays signed out', async () => {
    const client = stubClient({ getSession: async () => ({ status: 'signed_out' }) });
    const { result } = await ready(client);
    let ok = false;
    await act(async () => {
      ok = await result.current.signUp('a@b.c', 'pw');
    });
    expect(ok).toBe(true);
    expect(result.current.status).toBe('signed_out');
  });

  it('signOut clears the profile cache and state', async () => {
    const storage = memoryStorage({ [PROFILE_STORAGE_KEY]: cached });
    const { result } = await ready(stubClient(), storage);
    expect(storage.data[PROFILE_STORAGE_KEY]).toBeDefined();
    await act(async () => {
      await result.current.signOut();
    });
    expect(result.current.status).toBe('signed_out');
    expect(result.current.profile).toBeNull();
    expect(storage.data[PROFILE_STORAGE_KEY]).toBeUndefined();
  });

  it('signOut still signs out locally when the server call did not revoke', async () => {
    const client = stubClient({ signOut: async () => ({ ok: true, serverRevoked: false }) });
    const { result } = await ready(client);
    await act(async () => {
      await result.current.signOut();
    });
    expect(result.current.status).toBe('signed_out');
  });

  it('updateSenderName updates state and cache on success', async () => {
    const storage = memoryStorage();
    const { result } = await ready(stubClient(), storage);
    let ok = false;
    await act(async () => {
      ok = await result.current.updateSenderName('Pete');
    });
    expect(ok).toBe(true);
    expect(result.current.profile?.senderName).toBe('Pete');
    expect(JSON.parse(storage.data[PROFILE_STORAGE_KEY]).senderName).toBe('Pete');
  });

  it('updateSenderName failure keeps the old name, stays signed in, and shows copy', async () => {
    const storage = memoryStorage();
    const fail: ProfileResult = { ok: false, reason: 'offline' };
    const { result } = await ready(stubClient({ updateProfile: async () => fail }), storage);
    let ok = true;
    await act(async () => {
      ok = await result.current.updateSenderName('Pete');
    });
    expect(ok).toBe(false);
    expect(result.current.isSignedIn).toBe(true);
    expect(result.current.profile?.senderName).toBe('Peter');
    expect(result.current.error).toBe("You need a connection to do this. Nothing you've typed is lost.");
  });

  it('updateSenderName returning signed_out clears state', async () => {
    const storage = memoryStorage();
    const client = stubClient({
      updateProfile: async () => ({ ok: false, reason: 'signed_out' }),
      refreshSession: async () => ({ status: 'signed_out' }),
    });
    const { result } = await ready(client, storage);
    await act(async () => {
      await result.current.updateSenderName('Pete');
    });
    expect(result.current.status).toBe('signed_out');
    expect(storage.data[PROFILE_STORAGE_KEY]).toBeUndefined();
  });
});

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

const unauth: ProfileResult = { ok: false, reason: 'signed_out' };

describe('useSupabaseIdentity 401 refresh', () => {
  it('refreshes once and retries once, keeping the user signed in', async () => {
    const storage = memoryStorage({ [PROFILE_STORAGE_KEY]: cached });
    const getProfile = vi.fn<AuthClient['getProfile']>().mockResolvedValueOnce(unauth).mockResolvedValue({
      ok: true,
      profile: profile('Peter'),
    });
    const refreshSession = vi.fn(async (): Promise<SessionState> => signedIn);
    const signOut = vi.fn(async () => ({ ok: true as const, serverRevoked: true }));
    const { result } = renderHook(() =>
      useSupabaseIdentity({ client: stubClient({ getProfile, refreshSession, signOut }), storage }),
    );
    await waitFor(() => expect(getProfile).toHaveBeenCalledTimes(2));
    await act(async () => {});
    expect(refreshSession).toHaveBeenCalledTimes(1);
    expect(signOut).not.toHaveBeenCalled();
    expect(result.current.isSignedIn).toBe(true);
    expect(result.current.profile?.senderName).toBe('Peter');
  });

  it('signs out, calling client.signOut, when the retry is still 401', async () => {
    const storage = memoryStorage({ [PROFILE_STORAGE_KEY]: cached });
    const getProfile = vi.fn(async () => unauth);
    const signOut = vi.fn(async () => ({ ok: true as const, serverRevoked: true }));
    const { result } = renderHook(() =>
      useSupabaseIdentity({ client: stubClient({ getProfile, signOut }), storage }),
    );
    await waitFor(() => expect(result.current.status).toBe('signed_out'));
    expect(getProfile).toHaveBeenCalledTimes(2);
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(storage.data[PROFILE_STORAGE_KEY]).toBeUndefined();
  });

  it('stays signed in and offline when the refresh cannot reach the network', async () => {
    const storage = memoryStorage({ [PROFILE_STORAGE_KEY]: cached });
    const getProfile = vi.fn(async () => unauth);
    const signOut = vi.fn(async () => ({ ok: true as const, serverRevoked: true }));
    const client = stubClient({ getProfile, refreshSession: async () => ({ status: 'offline' }), signOut });
    const { result } = renderHook(() => useSupabaseIdentity({ client, storage }));
    await waitFor(() => expect(result.current.offline).toBe(true));
    expect(result.current.isSignedIn).toBe(true);
    expect(result.current.profile?.senderName).toBe('Peter');
    expect(getProfile).toHaveBeenCalledTimes(1);
    expect(signOut).not.toHaveBeenCalled();
  });

  it('updateSenderName retries after a refresh', async () => {
    const updateProfile = vi
      .fn<AuthClient['updateProfile']>()
      .mockResolvedValueOnce(unauth)
      .mockResolvedValue({ ok: true, profile: profile('Pete') });
    const { result } = renderHook(() =>
      useSupabaseIdentity({ client: stubClient({ updateProfile }), storage: memoryStorage() }),
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await act(async () => {});
    let ok = false;
    await act(async () => {
      ok = await result.current.updateSenderName('Pete');
    });
    expect(ok).toBe(true);
    expect(updateProfile).toHaveBeenCalledTimes(2);
    expect(result.current.profile?.senderName).toBe('Pete');
  });
});

describe('useSupabaseIdentity stale results', () => {
  it('signOut during a pending boot profile call leaves state and cache empty', async () => {
    const storage = memoryStorage();
    const pending = deferred<ProfileResult>();
    const client = stubClient({ getProfile: () => pending.promise });
    const { result } = renderHook(() => useSupabaseIdentity({ client, storage }));
    await waitFor(() => expect(result.current.isSignedIn).toBe(true));
    await act(async () => {
      await result.current.signOut();
    });
    await act(async () => {
      pending.resolve({ ok: true, profile: profile('Peter') });
    });
    expect(result.current.status).toBe('signed_out');
    expect(result.current.profile).toBeNull();
    expect(storage.data[PROFILE_STORAGE_KEY]).toBeUndefined();
  });

  it('a late boot profile does not overwrite a newer updateSenderName', async () => {
    const storage = memoryStorage();
    const pending = deferred<ProfileResult>();
    const client = stubClient({ getProfile: () => pending.promise });
    const { result } = renderHook(() => useSupabaseIdentity({ client, storage }));
    await waitFor(() => expect(result.current.isSignedIn).toBe(true));
    await act(async () => {
      await result.current.updateSenderName('Pete');
    });
    await act(async () => {
      pending.resolve({ ok: true, profile: profile('Old') });
    });
    expect(result.current.profile?.senderName).toBe('Pete');
    expect(JSON.parse(storage.data[PROFILE_STORAGE_KEY]).senderName).toBe('Pete');
  });

  it('signOut clears local state before the server call finishes', async () => {
    const pending = deferred<{ ok: true; serverRevoked: boolean }>();
    const storage = memoryStorage({ [PROFILE_STORAGE_KEY]: cached });
    const client = stubClient({ signOut: () => pending.promise });
    const { result } = renderHook(() => useSupabaseIdentity({ client, storage }));
    await waitFor(() => expect(result.current.isSignedIn).toBe(true));
    let done: Promise<void> = Promise.resolve();
    act(() => {
      done = result.current.signOut();
    });
    expect(result.current.status).toBe('signed_out');
    expect(storage.data[PROFILE_STORAGE_KEY]).toBeUndefined();
    await act(async () => {
      pending.resolve({ ok: true, serverRevoked: true });
      await done;
    });
  });

  it('signIn resolves without waiting for the gateway profile', async () => {
    const pending = deferred<ProfileResult>();
    let signedInNow = false;
    const client = stubClient({
      getSession: async () => (signedInNow ? signedIn : { status: 'signed_out' }),
      signIn: async () => {
        signedInNow = true;
        return { ok: true, userId: 'u1' };
      },
      getProfile: () => pending.promise,
    });
    const { result } = renderHook(() => useSupabaseIdentity({ client, storage: memoryStorage() }));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    let ok = false;
    await act(async () => {
      ok = await result.current.signIn('a@b.c', 'pw');
    });
    expect(ok).toBe(true);
    expect(result.current.isSignedIn).toBe(true);
    await act(async () => {
      pending.resolve({ ok: true, profile: profile('Peter') });
    });
    expect(result.current.profile?.senderName).toBe('Peter');
  });
});

describe('useSupabaseIdentity lifecycle and storage', () => {
  it('boots once even when a new client object is passed on rerender (not StrictMode)', async () => {
    const getSession = vi.fn(async (): Promise<SessionState> => signedIn);
    const { result, rerender } = renderHook(
      ({ client }) => useSupabaseIdentity({ client, storage: memoryStorage() }),
      { initialProps: { client: stubClient({ getSession }) } },
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    rerender({ client: stubClient({ getSession }) });
    await act(async () => {});
    expect(getSession).toHaveBeenCalledTimes(1);
  });

  it('unmounting before boot resolves updates nothing and makes no profile call', async () => {
    const pending = deferred<SessionState>();
    const getProfile = vi.fn(async (): Promise<ProfileResult> => ({ ok: true, profile: profile('Peter') }));
    const storage = memoryStorage();
    const client = stubClient({ getSession: () => pending.promise, getProfile });
    const { unmount } = renderHook(() => useSupabaseIdentity({ client, storage }));
    unmount();
    await act(async () => {
      pending.resolve(signedIn);
    });
    expect(getProfile).not.toHaveBeenCalled();
    expect(storage.data[PROFILE_STORAGE_KEY]).toBeUndefined();
  });

  it('identityErrorMessage maps unknown and inherited names to the unavailable copy', () => {
    const copy = "We can't reach your account right now. Please try again in a little while.";
    expect(identityErrorMessage('toString')).toBe(copy);
    expect(identityErrorMessage('constructor')).toBe(copy);
  });

  it('skips the refresh when sign-out happened while a profile call was in flight', async () => {
    const pending = deferred<ProfileResult>();
    const refreshSession = vi.fn(async (): Promise<SessionState> => signedIn);
    const client = stubClient({ getProfile: () => pending.promise, refreshSession });
    const { result } = renderHook(() => useSupabaseIdentity({ client, storage: memoryStorage() }));
    await waitFor(() => expect(result.current.isSignedIn).toBe(true));
    await act(async () => {
      await result.current.signOut();
    });
    await act(async () => {
      pending.resolve(unauth);
    });
    expect(refreshSession).not.toHaveBeenCalled();
  });

  it('tolerates storage that throws on get, set and remove', async () => {
    const boom = () => {
      throw new Error('storage disabled');
    };
    const storage: SendFlowStorage = { getItem: boom, setItem: boom, removeItem: boom };
    const { result } = renderHook(() => useSupabaseIdentity({ client: stubClient(), storage }));
    await waitFor(() => expect(result.current.profile?.senderName).toBe('Peter'));
    await act(async () => {
      await result.current.signOut();
    });
    expect(result.current.status).toBe('signed_out');
  });

  it.each([
    ['not json', '{oops'],
    ['an array', '[]'],
    ['a string', '"Peter"'],
    ['null', 'null'],
    ['wrong field types', JSON.stringify({ senderName: 5, contactSource: null })],
    ['unknown contactSource', JSON.stringify({ senderName: 'P', contactSource: 'x' })],
  ])('ignores a corrupt cache (%s)', async (_label, raw) => {
    const client = stubClient({ getSession: async () => ({ status: 'offline' }) });
    const { result } = renderHook(() =>
      useSupabaseIdentity({ client, storage: memoryStorage({ [PROFILE_STORAGE_KEY]: raw }) }),
    );
    expect(result.current.profile).toBeNull();
    await waitFor(() => expect(result.current.isSignedIn).toBe(true));
    expect(result.current.profile).toBeNull();
  });

  it('signUp ok with a session ends signed in', async () => {
    let session: SessionState = { status: 'signed_out' };
    const client = stubClient({
      getSession: async () => session,
      signUp: async () => {
        session = signedIn;
        return { ok: true, userId: 'u1' };
      },
    });
    const { result } = renderHook(() => useSupabaseIdentity({ client, storage: memoryStorage() }));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await act(async () => {
      await result.current.signUp('a@b.c', 'pw');
    });
    expect(result.current.isSignedIn).toBe(true);
  });

  it('signIn ok with getSession offline ends signed in, offline, and no profile when none is cached', async () => {
    let session: SessionState = { status: 'signed_out' };
    const client = stubClient({
      getSession: async () => session,
      signIn: async () => {
        session = { status: 'offline' };
        return { ok: true, userId: 'u1' };
      },
    });
    const storage = memoryStorage();
    const { result } = renderHook(() => useSupabaseIdentity({ client, storage }));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await act(async () => {
      await result.current.signIn('a@b.c', 'pw');
    });
    expect(result.current.isSignedIn).toBe(true);
    expect(result.current.offline).toBe(true);
    expect(result.current.profile).toBeNull();
  });

  it('updateSenderName failure from a populated cache leaves the cache unchanged', async () => {
    const storage = memoryStorage({ [PROFILE_STORAGE_KEY]: cached });
    const client = stubClient({ updateProfile: async () => ({ ok: false, reason: 'unavailable' }) });
    const { result } = renderHook(() => useSupabaseIdentity({ client, storage }));
    await waitFor(() => expect(result.current.isSignedIn).toBe(true));
    await act(async () => {});
    const before = storage.data[PROFILE_STORAGE_KEY];
    await act(async () => {
      await result.current.updateSenderName('Pete');
    });
    expect(storage.data[PROFILE_STORAGE_KEY]).toBe(before);
    expect(result.current.error).toBe("We can't reach your account right now. Please try again in a little while.");
  });
});
