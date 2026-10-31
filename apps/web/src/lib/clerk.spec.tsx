/**
 * The Clerk adapter (#299) with `@clerk/react` mocked: how `useAuth()` maps to `AccountAuth`
 * (#298), the offline rules (C5) and the calm localization (C7).
 */
import { act, render, renderHook, screen } from '@testing-library/react';
import { enUS } from '@clerk/localizations';

type Auth = {
  isLoaded: boolean;
  isSignedIn: boolean | undefined;
  userId: string | null | undefined;
  getToken: ReturnType<typeof vi.fn>;
  signOut: ReturnType<typeof vi.fn>;
};

const mocks = vi.hoisted(() => ({
  auth: null as unknown as Auth,
  clerkStatus: 'ready' as 'ready' | 'degraded' | 'loading',
  providerProps: null as null | Record<string, unknown>,
  getProfile: vi.fn(),
}));

vi.mock('@clerk/react', () => ({
  useAuth: () => mocks.auth,
  useClerk: () => ({ status: mocks.clerkStatus }),
  ClerkProvider: (props: Record<string, unknown> & { children: React.ReactNode }) => {
    mocks.providerProps = props;
    return <>{props.children}</>;
  },
}));
vi.mock('@griever/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@griever/api-client')>();
  return { ...actual, getProfile: mocks.getProfile };
});

import { CLERK_GIVE_UP_MS, ClerkAccount, localization, useClerkAuth } from './clerk';

function setAuth(overrides: Partial<Auth> = {}) {
  mocks.auth = {
    isLoaded: true,
    isSignedIn: true,
    userId: 'user_1',
    getToken: vi.fn(async () => 'jwt'),
    signOut: vi.fn(async () => undefined),
    ...overrides,
  };
}

function strings(value: unknown, path = ''): Array<[string, string]> {
  if (typeof value === 'string') {
    return [[path, value]];
  }
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, inner]) => strings(inner, path ? `${path}.${key}` : key));
  }
  return [];
}

beforeEach(() => {
  window.localStorage.clear();
  mocks.providerProps = null;
  mocks.clerkStatus = 'ready';
  mocks.getProfile.mockReset();
  setAuth();
  vi.stubGlobal('navigator', { ...navigator, onLine: true });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('localization (C7)', () => {
  it('has no "!" in any en-US string', () => {
    const withBang = strings(localization).filter(([, text]) => text.includes('!'));
    expect(withBang).toEqual([]);
    // The check scans a real, large set of strings, not an empty one.
    expect(strings(localization).length).toBeGreaterThan(500);
  });

  it('gives every sign-in failure the same calm sentence', () => {
    const errors = localization.unstable__errors as Record<string, string>;
    const messages = new Set([
      errors['form_password_incorrect'],
      errors['form_password_or_identifier_incorrect'],
      errors['form_identifier_not_found'],
      errors['form_code_incorrect'],
    ]);
    expect(messages).toEqual(new Set(["That didn't work. Please check what you typed and try again."]));
  });

  it('leaves the other strings as Clerk words them, apart from the "!"', () => {
    expect(localization.signIn?.start?.actionLink__use_email).toBe(enUS.signIn?.start?.actionLink__use_email);
    expect(localization.signUp?.start?.actionText).toBe(enUS.signUp?.start?.actionText);
  });

  it('greets a first visit calmly: no "Welcome back", and creating an account is named', () => {
    const title = 'Sign in or create an account';
    const subtitle = 'It takes a minute. Your details stay private.';
    expect(localization.signIn?.start?.title).toBe(title);
    expect(localization.signIn?.start?.subtitle).toBe(subtitle);
    expect(localization.signIn?.start?.actionText).toBe('New here?');
    expect(localization.signIn?.start?.actionLink).toBe('Create an account');
    expect(localization.signUp?.start?.title).toBe(title);
    expect(localization.signUp?.start?.subtitle).toBe(subtitle);
    expect(JSON.stringify(localization.signIn?.start)).not.toMatch(/welcome back/i);
    expect(JSON.stringify(localization.signUp?.start)).not.toMatch(/welcome/i);
  });
});

describe('useClerkAuth status', () => {
  it('is signed_in with the user id once Clerk has loaded a session', () => {
    const { result } = renderHook(() => useClerkAuth());
    expect(result.current.auth).toMatchObject({ status: 'signed_in', userId: 'user_1' });
  });

  it('is signed_out only when Clerk has loaded and confirmed no session', () => {
    setAuth({ isSignedIn: false, userId: null });
    const { result } = renderHook(() => useClerkAuth());
    expect(result.current.auth).toMatchObject({ status: 'signed_out', userId: null });
  });

  it('is loading, never signed_out, while Clerk has not loaded and there is no marker yet', () => {
    setAuth({ isLoaded: false, isSignedIn: undefined, userId: undefined });
    const { result } = renderHook(() => useClerkAuth());
    expect(result.current.auth.status).toBe('loading');
    expect(result.current.unavailable).toBe(false);
  });

  it('with no marker, reports the accounts as unavailable after the give-up time, still not signed_out', () => {
    vi.useFakeTimers();
    setAuth({ isLoaded: false, isSignedIn: undefined, userId: undefined });
    const { result } = renderHook(() => useClerkAuth());
    act(() => {
      vi.advanceTimersByTime(CLERK_GIVE_UP_MS);
    });
    expect(result.current.unavailable).toBe(true);
    expect(result.current.auth.status).toBe('loading');
  });

  it('with the marker, is signed_in from the marker at once while Clerk loads, and getToken stays offline', async () => {
    window.localStorage.setItem('gg.signedIn.v1', 'user_1');
    setAuth({ isLoaded: false, isSignedIn: undefined, userId: undefined });
    const { result } = renderHook(() => useClerkAuth());
    expect(result.current.auth).toMatchObject({ status: 'signed_in', userId: 'user_1' });
    expect(result.current.unavailable).toBe(false);
    expect(await result.current.auth.getToken()).toEqual({ ok: false, reason: 'offline' });
  });

  it('with the marker and an offline browser, is signed_in from the marker', () => {
    window.localStorage.setItem('gg.signedIn.v1', 'user_1');
    vi.stubGlobal('navigator', { ...navigator, onLine: false });
    setAuth({ isLoaded: false, isSignedIn: undefined, userId: undefined });
    const { result } = renderHook(() => useClerkAuth());
    expect(result.current.auth).toMatchObject({ status: 'signed_in', userId: 'user_1' });
  });

  it('does not trust a signed-out answer from a degraded Clerk: the marker keeps the person signed in (C5)', () => {
    window.localStorage.setItem('gg.signedIn.v1', 'user_1');
    mocks.clerkStatus = 'degraded';
    setAuth({ isSignedIn: false, userId: null });
    const { result } = renderHook(() => useClerkAuth());
    expect(result.current.auth).toMatchObject({ status: 'signed_in', userId: 'user_1' });
  });

  it('does not trust a signed-out answer while the browser is offline (C5)', () => {
    window.localStorage.setItem('gg.signedIn.v1', 'user_1');
    vi.stubGlobal('navigator', { ...navigator, onLine: false });
    setAuth({ isSignedIn: false, userId: null });
    const { result } = renderHook(() => useClerkAuth());
    expect(result.current.auth.status).toBe('signed_in');
  });

  it('is loading, not signed_out, for a degraded Clerk with no marker', () => {
    mocks.clerkStatus = 'degraded';
    setAuth({ isSignedIn: false, userId: null });
    const { result } = renderHook(() => useClerkAuth());
    expect(result.current.auth.status).toBe('loading');
  });

  it('reconciles to signed_out when Clerk loads and confirms there is no session', () => {
    window.localStorage.setItem('gg.signedIn.v1', 'user_1');
    setAuth({ isLoaded: false, isSignedIn: undefined, userId: undefined });
    const { result, rerender } = renderHook(() => useClerkAuth());
    expect(result.current.auth.status).toBe('signed_in');
    setAuth({ isSignedIn: false, userId: null });
    rerender();
    expect(result.current.auth.status).toBe('signed_out');
  });
});

describe('useClerkAuth getToken', () => {
  it('returns the token', async () => {
    const { result } = renderHook(() => useClerkAuth());
    expect(await result.current.auth.getToken()).toEqual({ ok: true, token: 'jwt' });
    expect(mocks.auth.getToken).toHaveBeenLastCalledWith(undefined);
  });

  it('maps forceRefresh to skipCache', async () => {
    const { result } = renderHook(() => useClerkAuth());
    await result.current.auth.getToken({ forceRefresh: true });
    expect(mocks.auth.getToken).toHaveBeenLastCalledWith({ skipCache: true });
  });

  it('maps a null token to signed_out', async () => {
    setAuth({ getToken: vi.fn(async () => null) });
    const { result } = renderHook(() => useClerkAuth());
    expect(await result.current.auth.getToken()).toEqual({ ok: false, reason: 'signed_out' });
  });

  it('maps a throw (the network) to offline', async () => {
    setAuth({ getToken: vi.fn(() => Promise.reject(new Error('network'))) });
    const { result } = renderHook(() => useClerkAuth());
    expect(await result.current.auth.getToken()).toEqual({ ok: false, reason: 'offline' });
  });

  it('is offline, and asks Clerk for nothing, while Clerk has not loaded', async () => {
    setAuth({ isLoaded: false, isSignedIn: undefined, userId: undefined });
    const { result } = renderHook(() => useClerkAuth());
    expect(await result.current.auth.getToken()).toEqual({ ok: false, reason: 'offline' });
    expect(mocks.auth.getToken).not.toHaveBeenCalled();
  });

  it('is signed_out, and asks Clerk for nothing, when there is no session', async () => {
    setAuth({ isSignedIn: false, userId: null });
    const { result } = renderHook(() => useClerkAuth());
    expect(await result.current.auth.getToken()).toEqual({ ok: false, reason: 'signed_out' });
    expect(mocks.auth.getToken).not.toHaveBeenCalled();
  });
});

describe('useClerkAuth signOut', () => {
  it('ends the Clerk session and leaves no pending flag', async () => {
    const { result } = renderHook(() => useClerkAuth());
    await result.current.auth.signOut();
    expect(mocks.auth.signOut).toHaveBeenCalledOnce();
    expect(window.localStorage.getItem('gg.signOutPending')).toBeNull();
  });

  it('marks the sign-out pending and rejects when Clerk cannot be reached', async () => {
    setAuth({ signOut: vi.fn(() => Promise.reject(new Error('network'))) });
    const { result } = renderHook(() => useClerkAuth());
    await expect(result.current.auth.signOut()).rejects.toThrow('network');
    expect(window.localStorage.getItem('gg.signOutPending')).toBe('1');
  });

  it('marks the sign-out pending when Clerk has not loaded', async () => {
    setAuth({ isLoaded: false, isSignedIn: undefined, userId: undefined });
    const { result } = renderHook(() => useClerkAuth());
    await expect(result.current.auth.signOut()).rejects.toThrow();
    expect(window.localStorage.getItem('gg.signOutPending')).toBe('1');
    expect(mocks.auth.signOut).not.toHaveBeenCalled();
  });

  it('reports signed_out while a sign-out is pending, whatever Clerk says, even when signOut keeps failing', async () => {
    window.localStorage.setItem('gg.signOutPending', '1');
    window.localStorage.setItem('gg.signedIn.v1', 'user_1');
    setAuth({ signOut: vi.fn(() => Promise.reject(new Error('network'))) });
    const { result } = renderHook(() => useClerkAuth());
    await act(async () => {});
    expect(mocks.auth.signOut).toHaveBeenCalled();
    expect(result.current.auth).toMatchObject({ status: 'signed_out', userId: null });
    expect(window.localStorage.getItem('gg.signOutPending')).toBe('1');
  });

  it('reads the flag on every render: a failed signOut turns the status to signed_out', async () => {
    setAuth({ signOut: vi.fn(() => Promise.reject(new Error('network'))) });
    const { result } = renderHook(() => useClerkAuth());
    expect(result.current.auth.status).toBe('signed_in');
    await act(async () => {
      await result.current.auth.signOut().catch(() => undefined);
    });
    expect(result.current.auth.status).toBe('signed_out');
  });

  it('finishes a pending sign-out once Clerk loads, then clears the flag', async () => {
    window.localStorage.setItem('gg.signOutPending', '1');
    const { result } = renderHook(() => useClerkAuth());
    expect(result.current.auth.status).toBe('signed_out');
    await act(async () => {});
    expect(mocks.auth.signOut).toHaveBeenCalledOnce();
    expect(window.localStorage.getItem('gg.signOutPending')).toBeNull();
  });

  it('retries a pending sign-out when the browser comes back online', async () => {
    window.localStorage.setItem('gg.signOutPending', '1');
    vi.stubGlobal('navigator', { ...navigator, onLine: false });
    renderHook(() => useClerkAuth());
    await act(async () => {});
    expect(mocks.auth.signOut).not.toHaveBeenCalled();
    vi.stubGlobal('navigator', { ...navigator, onLine: true });
    await act(async () => {
      window.dispatchEvent(new Event('online'));
    });
    expect(mocks.auth.signOut).toHaveBeenCalledOnce();
    expect(window.localStorage.getItem('gg.signOutPending')).toBeNull();
  });
});

describe('ClerkAccount', () => {
  it('reports unavailable without a publishable key, and mounts no Clerk', () => {
    vi.stubEnv('VITE_CLERK_PUBLISHABLE_KEY', '');
    render(<ClerkAccount>{(state) => <p>{state.unavailable ? 'unavailable' : 'ready'}</p>}</ClerkAccount>);
    expect(screen.getByText('unavailable')).toBeInTheDocument();
    expect(mocks.providerProps).toBeNull();
  });

  it('gives the app the account and a token once Clerk has a session', async () => {
    vi.stubEnv('VITE_CLERK_PUBLISHABLE_KEY', 'pk_test_abc');
    mocks.getProfile.mockResolvedValue({ ok: false, reason: 'no_profile' });
    let token: string | null = null;
    render(
      <ClerkAccount>
        {(state) => {
          if (!state.unavailable) {
            void state.getAccessToken().then((t) => {
              token = t;
            });
          }
          return <p>{state.unavailable ? 'unavailable' : state.account.status}</p>;
        }}
      </ClerkAccount>,
    );
    expect(await screen.findByText('signed_in')).toBeInTheDocument();
    await act(async () => {});
    expect(token).toBe('jwt');
    expect(mocks.providerProps).toMatchObject({
      publishableKey: 'pk_test_abc',
      localization,
      appearance: {
        variables: { colorDanger: '#aa0b56', colorRing: '#006786', colorMutedForeground: '#5e5d5c' },
        options: { animations: false },
        elements: { formFieldInput: { minHeight: 44 }, socialButtonsBlockButton: { minHeight: 44 } },
      },
    });
    expect(window.localStorage.getItem('gg.signedIn.v1')).toBe('user_1');
  });
});
