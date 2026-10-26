import { describe, expect, it, jest } from '@jest/globals';
import { renderHook, act } from '@testing-library/react-native';
import { toAccountAuth, useClerkAccountAuth } from './clerk';
import type { AdapterInputs, ClerkAuthLike } from './clerk';
import { clerkMessage } from './clerkMessages';

const mockUseAuth = jest.fn();
const mockUseClerk = jest.fn();
jest.mock('@clerk/expo', () => ({ useAuth: () => mockUseAuth(), useClerk: () => mockUseClerk(), ClerkProvider: () => null }));
jest.mock('@clerk/expo/token-cache', () => ({ tokenCache: undefined }));
jest.mock('@clerk/expo/resource-cache', () => ({ resourceCache: undefined }));

function clerk(over: Partial<ClerkAuthLike> = {}): ClerkAuthLike {
  return { isLoaded: true, isSignedIn: true, userId: 'user_1', getToken: async () => 'tok', ...over };
}
function adapt(over: Omit<Partial<AdapterInputs>, 'clerk'> & { clerk?: Partial<ClerkAuthLike> } = {}) {
  const { clerk: clerkOver, ...rest } = over;
  return toAccountAuth({ clerk: clerk(clerkOver), ready: true, hydrated: true, signOutPending: false, marker: null, signOut: async () => undefined, ...rest });
}
const notLoaded = { isLoaded: false, isSignedIn: undefined, userId: undefined };

describe('toAccountAuth status', () => {
  it('is signed_in with the user id once Clerk is ready and has a session', () => {
    expect(adapt()).toMatchObject({ status: 'signed_in', userId: 'user_1' });
  });

  it('is signed_out when Clerk is ready and says there is no session', () => {
    expect(adapt({ clerk: { isSignedIn: false, userId: null } })).toMatchObject({ status: 'signed_out', userId: null });
  });

  it('is loading, never signed_out, while Clerk has not loaded and nothing is stored', () => {
    expect(adapt({ clerk: notLoaded }).status).toBe('loading');
  });

  it('does not read a degraded Clerk (loaded from the resource cache) as signed_out', () => {
    expect(adapt({ ready: false, clerk: { isSignedIn: false, userId: null } }).status).toBe('loading');
    expect(adapt({ ready: false, marker: 'user_1', clerk: { isSignedIn: false, userId: null } })).toMatchObject({ status: 'signed_in', userId: 'user_1' });
  });

  it('trusts a degraded Clerk that still holds a session', () => {
    expect(adapt({ ready: false })).toMatchObject({ status: 'signed_in', userId: 'user_1' });
  });

  it('is signed_in from the stored marker when Clerk cannot load (offline boot, no resource cache)', () => {
    expect(adapt({ clerk: notLoaded, marker: 'user_9' })).toMatchObject({ status: 'signed_in', userId: 'user_9' });
  });

  it('is loading until the profile cache has been read', () => {
    expect(adapt({ hydrated: false, marker: 'user_9' }).status).toBe('loading');
  });

  it('is loading, not signed_in, when a session has no user id yet', () => {
    expect(adapt({ clerk: { userId: null } }).status).toBe('loading');
  });

  it('is signed_out while a sign-out is pending, even if Clerk still holds the session', () => {
    expect(adapt({ signOutPending: true })).toMatchObject({ status: 'signed_out', userId: null });
    expect(adapt({ signOutPending: true, marker: 'user_1', clerk: notLoaded }).status).toBe('signed_out');
  });
});

describe('toAccountAuth getToken', () => {
  it('returns the token', async () => {
    expect(await adapt().getToken()).toEqual({ ok: true, token: 'tok' });
  });

  it('asks Clerk for a fresh token only when forceRefresh is set', async () => {
    const getToken = jest.fn(async () => 'tok');
    await adapt({ clerk: { getToken } }).getToken();
    await adapt({ clerk: { getToken } }).getToken({ forceRefresh: true });
    expect(getToken.mock.calls).toEqual([[{ skipCache: false }], [{ skipCache: true }]]);
  });

  it('maps a null token to signed_out', async () => {
    expect(await adapt({ clerk: { getToken: async () => null } }).getToken()).toEqual({ ok: false, reason: 'signed_out' });
  });

  it('maps a network throw to offline, not signed_out', async () => {
    const auth = adapt({
      clerk: {
        getToken: async () => {
          throw Object.assign(new Error('Network'), { code: 'network_error' });
        },
      },
    });
    expect(await auth.getToken()).toEqual({ ok: false, reason: 'offline' });
  });

  it('maps any other getToken failure to failed, not offline (#343)', async () => {
    const auth = adapt({
      clerk: {
        getToken: async () => {
          throw new Error('Something broke');
        },
      },
    });
    expect(await auth.getToken()).toEqual({ ok: false, reason: 'failed' });
  });

  it('is not settled until Clerk has loaded and is ready or holds a session (#343)', () => {
    expect(adapt({ clerk: notLoaded, marker: 'u' }).settled).toBe(false);
    expect(adapt({ ready: false, marker: 'u', clerk: { isSignedIn: false, userId: null } }).settled).toBe(false);
    expect(adapt().settled).toBe(true);
    expect(adapt({ ready: false }).settled).toBe(true);
  });

  it('does not ask Clerk for a token when signed out, and reads an unconfirmed Clerk as offline', async () => {
    const getToken = jest.fn(async () => 'tok');
    expect(await adapt({ clerk: { isSignedIn: false, getToken } }).getToken()).toEqual({ ok: false, reason: 'signed_out' });
    expect(await adapt({ clerk: { ...notLoaded, getToken }, marker: 'u' }).getToken()).toEqual({ ok: false, reason: 'offline' });
    expect(await adapt({ ready: false, marker: 'u', clerk: { isSignedIn: false, getToken } }).getToken()).toEqual({ ok: false, reason: 'offline' });
    expect(getToken).not.toHaveBeenCalled();
  });
});

describe('useClerkAccountAuth sign-out', () => {
  function memory(seed: Record<string, string> = {}) {
    const data = { ...seed };
    return { data, getItem: (k: string) => data[k] ?? null, setItem: (k: string, v: string) => void (data[k] = v), removeItem: (k: string) => void delete data[k] };
  }
  const signedInClerk = (signOut: () => Promise<void>) => ({ ...clerk(), signOut });

  it('writes the pending flag before asking Clerk, and clears it once Clerk has signed out', async () => {
    const storage = memory();
    const seen: Array<string | null> = [];
    mockUseClerk.mockReturnValue({ status: 'ready' });
    mockUseAuth.mockReturnValue(signedInClerk(async () => void seen.push(storage.getItem('gg.signOutPending'))));
    const { result } = renderHook(() => useClerkAccountAuth(storage, true));
    await act(async () => result.current.signOut());
    expect(seen).toEqual(['1']);
    expect(storage.data['gg.signOutPending']).toBeUndefined();
  });

  it('keeps the flag and reports signed_out when Clerk cannot be reached', async () => {
    const storage = memory({ 'gg.signedIn.v1': 'user_1' });
    mockUseClerk.mockReturnValue({ status: 'ready' });
    mockUseAuth.mockReturnValue(signedInClerk(async () => Promise.reject(new Error('Network'))));
    const { result } = renderHook(() => useClerkAccountAuth(storage, true));
    await act(async () => {
      await expect(result.current.signOut()).rejects.toThrow('Network');
    });
    expect(storage.data['gg.signOutPending']).toBe('1');
    expect(result.current.status).toBe('signed_out');
  });

  it('reads a flag left by an earlier launch as signed_out, then retries once Clerk is ready and clears it', async () => {
    const storage = memory({ 'gg.signOutPending': '1', 'gg.signedIn.v1': 'user_1' });
    const signOut = jest.fn(async () => undefined);
    mockUseClerk.mockReturnValue({ status: 'degraded' });
    mockUseAuth.mockReturnValue(signedInClerk(signOut));
    const { result, rerender } = renderHook(() => useClerkAccountAuth(storage, true));
    expect(result.current.status).toBe('signed_out');
    expect(signOut).not.toHaveBeenCalled();
    mockUseClerk.mockReturnValue({ status: 'ready' });
    await act(async () => rerender({}));
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(storage.data['gg.signOutPending']).toBeUndefined();
  });
});

describe('clerkMessage', () => {
  it.each([
    ['network_error', "You need a connection to do this. Nothing you've typed is lost."],
    ['form_password_incorrect', "That email and password don't match. Please try again."],
    ['form_identifier_exists', 'This email already has an account. Sign in instead.'],
    ['too_many_requests', 'Too many tries. Please wait a few minutes and try again.'],
    ['form_code_incorrect', "That code doesn't match. Please check it and try again."],
    ['verification_expired', 'That code has expired. Please ask for a new one.'],
    ['form_password_or_identifier_incorrect', "That email and password don't match. Please try again."],
    ['something_new', "We can't reach your account right now. Please try again in a little while."],
  ])('maps %s', (code, text) => {
    expect(clerkMessage({ code })).toBe(text);
  });

  it('reads the code of a thrown API error', () => {
    expect(clerkMessage({ errors: [{ code: 'network_error' }] })).toMatch(/You need a connection/);
  });
});

describe('clerkMessage on the email-code path', () => {
  it('does not mention a password when the email is unknown', () => {
    const text = clerkMessage({ code: 'form_identifier_not_found' }, 'code');
    expect(text).toBe("We couldn't send a code to that email. Please check it and try again.");
    expect(text).not.toMatch(/password/i);
  });
});
