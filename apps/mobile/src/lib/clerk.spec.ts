import { describe, expect, it, jest } from '@jest/globals';
import { toAccountAuth } from './clerk';
import type { ClerkAuthLike } from './clerk';
import { clerkMessage } from './clerkMessages';

function clerk(over: Partial<ClerkAuthLike> = {}): ClerkAuthLike {
  return {
    isLoaded: true,
    isSignedIn: true,
    userId: 'user_1',
    sessionId: 'sess_1',
    getToken: async () => 'tok',
    signOut: async () => undefined,
    ...over,
  };
}
const adapt = (over: Partial<ClerkAuthLike> = {}, ended: string | null = null, markEnded: (id: string | null) => void = () => undefined) => toAccountAuth(clerk(over), ended, markEnded);

describe('toAccountAuth status', () => {
  it('is signed_in with the user id once Clerk has loaded a session', () => {
    expect(adapt()).toMatchObject({ status: 'signed_in', userId: 'user_1' });
  });

  it('is signed_out only when Clerk has loaded and says there is no session', () => {
    expect(adapt({ isSignedIn: false, userId: null, sessionId: null })).toMatchObject({ status: 'signed_out', userId: null });
  });

  it('is loading, never signed_out, while Clerk has not loaded (offline first launch)', () => {
    expect(adapt({ isLoaded: false, isSignedIn: undefined, userId: undefined, sessionId: undefined }).status).toBe('loading');
  });

  it('is loading, not signed_in, when a session has no user id yet', () => {
    expect(adapt({ userId: null }).status).toBe('loading');
  });

  it('treats the session this device signed out of as signed_out even though Clerk still holds it', () => {
    expect(adapt({}, 'sess_1').status).toBe('signed_out');
    expect(adapt({ sessionId: 'sess_2' }, 'sess_1').status).toBe('signed_in');
  });
});

describe('toAccountAuth getToken', () => {
  it('returns the token', async () => {
    expect(await adapt().getToken()).toEqual({ ok: true, token: 'tok' });
  });

  it('asks Clerk for a fresh token only when forceRefresh is set', async () => {
    const getToken = jest.fn(async () => 'tok');
    await adapt({ getToken }).getToken();
    await adapt({ getToken }).getToken({ forceRefresh: true });
    expect(getToken.mock.calls).toEqual([[{ skipCache: false }], [{ skipCache: true }]]);
  });

  it('maps a null token to signed_out', async () => {
    expect(await adapt({ getToken: async () => null }).getToken()).toEqual({ ok: false, reason: 'signed_out' });
  });

  it('maps a network throw to offline, not signed_out', async () => {
    const auth = adapt({
      getToken: async () => {
        throw Object.assign(new Error('Network'), { code: 'network_error' });
      },
    });
    expect(await auth.getToken()).toEqual({ ok: false, reason: 'offline' });
  });

  it('does not ask Clerk for a token when signed out, and reads loading as offline', async () => {
    const getToken = jest.fn(async () => 'tok');
    expect(await adapt({ isSignedIn: false, getToken }).getToken()).toEqual({ ok: false, reason: 'signed_out' });
    expect(await adapt({ isLoaded: false, getToken }).getToken()).toEqual({ ok: false, reason: 'offline' });
    expect(getToken).not.toHaveBeenCalled();
  });
});

describe('toAccountAuth signOut', () => {
  it('marks the session ended before calling Clerk, so it holds even if Clerk fails offline', async () => {
    const order: string[] = [];
    const markEnded = jest.fn((id: string | null) => void order.push(`ended:${id}`));
    const auth = adapt(
      {
        signOut: async () => {
          order.push('clerk');
          throw new Error('Network');
        },
      },
      null,
      markEnded,
    );
    await expect(auth.signOut()).rejects.toThrow('Network');
    expect(order).toEqual(['ended:sess_1', 'clerk']);
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
    ['something_new', "We can't reach your account right now. Please try again in a little while."],
  ])('maps %s', (code, text) => {
    expect(clerkMessage({ code })).toBe(text);
  });

  it('reads the code of a thrown API error', () => {
    expect(clerkMessage({ errors: [{ code: 'network_error' }] })).toMatch(/You need a connection/);
  });
});
