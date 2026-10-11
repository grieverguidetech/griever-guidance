import { act, renderHook, waitFor } from '@testing-library/react';
import type { AuthClient, ProfileResult, SessionState } from '@griever/api-client/auth';
import type { Profile } from '@griever/shared';
import { PROFILE_STORAGE_KEY, useSupabaseIdentity } from './useSupabaseIdentity.js';
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
    expect(result.current.offline).toBe(false);
    expect(result.current.profile?.senderName).toBe('Peter');
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
      const client = stubClient({ getProfile: async () => ({ ok: false, reason }) });
      const { result } = renderHook(() => useSupabaseIdentity({ client, storage }));
      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(result.current.isSignedIn).toBe(true);
      expect(result.current.profile?.senderName).toBe('Peter');
      expect(result.current.error).toBeNull();
      expect(storage.data[PROFILE_STORAGE_KEY]).toBe(cached);
    },
  );

  it('clears state when the profile call returns signed_out', async () => {
    const storage = memoryStorage({ [PROFILE_STORAGE_KEY]: cached });
    const client = stubClient({ getProfile: async () => ({ ok: false, reason: 'signed_out' }) });
    const { result } = renderHook(() => useSupabaseIdentity({ client, storage }));
    await waitFor(() => expect(result.current.status).toBe('signed_out'));
    expect(result.current.profile).toBeNull();
    expect(storage.data[PROFILE_STORAGE_KEY]).toBeUndefined();
  });

  it('treats no_profile as a normal state, not an error', async () => {
    const storage = memoryStorage();
    const client = stubClient({ getProfile: async () => ({ ok: false, reason: 'no_profile' }) });
    const { result } = renderHook(() => useSupabaseIdentity({ client, storage }));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isSignedIn).toBe(true);
    expect(result.current.profile).toBeNull();
    expect(result.current.error).toBeNull();
  });
});

describe('useSupabaseIdentity actions', () => {
  async function ready(client: AuthClient, storage = memoryStorage()) {
    const hook = renderHook(() => useSupabaseIdentity({ client, storage }));
    await waitFor(() => expect(hook.result.current.isLoading).toBe(false));
    return hook;
  }

  const signUpCopy = {
    email_taken: 'This email already has an account. Sign in instead.',
    weak_password: 'Please choose a longer password.',
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
    const client = stubClient({ updateProfile: async () => ({ ok: false, reason: 'signed_out' }) });
    const { result } = await ready(client, storage);
    await act(async () => {
      await result.current.updateSenderName('Pete');
    });
    expect(result.current.status).toBe('signed_out');
    expect(storage.data[PROFILE_STORAGE_KEY]).toBeUndefined();
  });
});
