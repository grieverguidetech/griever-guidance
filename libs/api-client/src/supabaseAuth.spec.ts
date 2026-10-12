import {
  AuthApiError,
  AuthSessionMissingError,
  AuthRefreshDiscardedError,
  AuthRetryableFetchError,
} from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAuthClient } from './supabaseAuth.js';

const fetchMock = vi.fn();
const storage = { getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn() };

const auth = {
  signUp: vi.fn(),
  signInWithPassword: vi.fn(),
  signOut: vi.fn(),
  getSession: vi.fn(),
  refreshSession: vi.fn(),
  startAutoRefresh: vi.fn(),
  stopAutoRefresh: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  setSession: vi.fn(),
  updateUser: vi.fn(),
};
const stub = { auth } as unknown as SupabaseClient;
const make = () =>
  createAuthClient({ url: 'http://sb', anonKey: 'anon', storage }, stub);

beforeEach(() => {
  Object.values(auth).forEach((f) => f.mockReset());
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

const apiError = (status: number, code: string) =>
  new AuthApiError('msg', status, code as never);
const offlineError = () => new AuthRetryableFetchError('Failed to fetch', 0);

describe('signUp', () => {
  it('returns the new user id', async () => {
    auth.signUp.mockResolvedValue({
      data: { user: { id: 'u1', identities: [{}] } },
      error: null,
    });
    expect(await make().signUp('a@b.c', 'pw')).toEqual({
      ok: true,
      userId: 'u1',
    });
    expect(auth.signUp).toHaveBeenCalledWith({
      email: 'a@b.c',
      password: 'pw',
    });
  });

  it('maps user_already_exists to email_taken', async () => {
    auth.signUp.mockResolvedValue({
      data: { user: null },
      error: apiError(422, 'user_already_exists'),
    });
    expect(await make().signUp('a@b.c', 'pw')).toEqual({
      ok: false,
      reason: 'email_taken',
    });
  });

  it('maps email_exists to email_taken', async () => {
    auth.signUp.mockResolvedValue({
      data: { user: null },
      error: apiError(422, 'email_exists'),
    });
    expect(await make().signUp('a@b.c', 'pw')).toEqual({
      ok: false,
      reason: 'email_taken',
    });
  });

  it('maps an obfuscated duplicate (no identities) to email_taken', async () => {
    auth.signUp.mockResolvedValue({
      data: { user: { id: 'x', identities: [] } },
      error: null,
    });
    expect(await make().signUp('a@b.c', 'pw')).toEqual({
      ok: false,
      reason: 'email_taken',
    });
  });

  it('maps a network failure to offline', async () => {
    auth.signUp.mockResolvedValue({
      data: { user: null },
      error: offlineError(),
    });
    expect(await make().signUp('a@b.c', 'pw')).toEqual({
      ok: false,
      reason: 'offline',
    });
  });

  it('maps weak_password', async () => {
    auth.signUp.mockResolvedValue({
      data: { user: null },
      error: apiError(422, 'weak_password'),
    });
    expect(await make().signUp('a@b.c', 'pw')).toEqual({
      ok: false,
      reason: 'weak_password',
    });
  });

  it('maps a 503 from Supabase to unavailable, not offline', async () => {
    auth.signUp.mockResolvedValue({
      data: { user: null },
      error: new AuthRetryableFetchError('down', 503),
    });
    expect(await make().signUp('a@b.c', 'pw')).toEqual({
      ok: false,
      reason: 'unavailable',
    });
  });

  it('maps a thrown TypeError to offline without throwing', async () => {
    auth.signUp.mockRejectedValue(new TypeError('fetch failed'));
    expect(await make().signUp('a@b.c', 'pw')).toEqual({
      ok: false,
      reason: 'offline',
    });
  });
});

describe('signIn', () => {
  it('returns the user id', async () => {
    auth.signInWithPassword.mockResolvedValue({
      data: { user: { id: 'u1' } },
      error: null,
    });
    expect(await make().signIn('a@b.c', 'pw')).toEqual({
      ok: true,
      userId: 'u1',
    });
  });

  it.each([
    'invalid_credentials',
    'user_not_found',
    'validation_failed',
    'email_address_invalid',
  ])('maps %s to one generic invalid_credentials', async (code) => {
    auth.signInWithPassword.mockResolvedValue({
      data: { user: null },
      error: apiError(400, code),
    });
    expect(await make().signIn('a@b.c', 'pw')).toEqual({
      ok: false,
      reason: 'invalid_credentials',
    });
  });

  it('reports email_not_confirmed on its own, never as wrong credentials', async () => {
    auth.signInWithPassword.mockResolvedValue({
      data: { user: null },
      error: apiError(400, 'email_not_confirmed'),
    });
    expect(await make().signIn('a@b.c', 'pw')).toEqual({
      ok: false,
      reason: 'email_not_confirmed',
    });
  });

  it('maps 429 and over_request_rate_limit to rate_limited', async () => {
    auth.signInWithPassword.mockResolvedValueOnce({
      data: { user: null },
      error: apiError(429, 'over_request_rate_limit'),
    });
    expect(await make().signIn('a@b.c', 'pw')).toEqual({
      ok: false,
      reason: 'rate_limited',
    });
    auth.signInWithPassword.mockResolvedValueOnce({
      data: { user: null },
      error: apiError(429, 'unknown'),
    });
    expect(await make().signIn('a@b.c', 'pw')).toEqual({
      ok: false,
      reason: 'rate_limited',
    });
  });

  it('maps an unknown error code to failed', async () => {
    auth.signInWithPassword.mockResolvedValue({
      data: { user: null },
      error: apiError(400, 'something_new'),
    });
    expect(await make().signIn('a@b.c', 'pw')).toEqual({
      ok: false,
      reason: 'failed',
    });
  });

  it('maps a 503 to unavailable', async () => {
    auth.signInWithPassword.mockResolvedValue({
      data: { user: null },
      error: new AuthRetryableFetchError('down', 503),
    });
    expect(await make().signIn('a@b.c', 'pw')).toEqual({
      ok: false,
      reason: 'unavailable',
    });
  });

  it('keeps offline distinct from invalid_credentials', async () => {
    auth.signInWithPassword.mockResolvedValue({
      data: { user: null },
      error: offlineError(),
    });
    expect(await make().signIn('a@b.c', 'pw')).toEqual({
      ok: false,
      reason: 'offline',
    });
  });
});

describe('signOut', () => {
  it('signs out locally only and reports the server revoked it', async () => {
    auth.signOut.mockResolvedValue({ error: null });
    expect(await make().signOut()).toEqual({ ok: true, serverRevoked: true });
    expect(auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  it('still succeeds locally when the server call fails', async () => {
    auth.signOut.mockResolvedValueOnce({ error: offlineError() });
    expect(await make().signOut()).toEqual({ ok: true, serverRevoked: false });
    auth.signOut.mockRejectedValueOnce(new TypeError('fetch failed'));
    expect(await make().signOut()).toEqual({ ok: true, serverRevoked: false });
  });
});

describe('getSession', () => {
  it('returns signed_out when there is no session and signed_in with a summary otherwise', async () => {
    auth.getSession.mockResolvedValueOnce({
      data: { session: null },
      error: null,
    });
    expect(await make().getSession()).toEqual({ status: 'signed_out' });
    auth.getSession.mockResolvedValueOnce({
      data: {
        session: { access_token: 't', user: { id: 'u1', email: 'a@b.c' } },
      },
      error: null,
    });
    expect(await make().getSession()).toEqual({
      status: 'signed_in',
      session: { userId: 'u1', email: 'a@b.c', accessToken: 't' },
    });
  });

  it('returns offline, not signed_out, when an expired session cannot refresh without a network', async () => {
    auth.getSession.mockResolvedValue({
      data: { session: null },
      error: offlineError(),
    });
    expect(await make().getSession()).toEqual({ status: 'offline' });
  });
});

describe('refreshSession', () => {
  it('returns signed_in with a summary when the refresh works', async () => {
    auth.refreshSession.mockResolvedValue({
      data: { session: { access_token: 'new', user: { id: 'u1', email: null } } },
      error: null,
    });
    expect(await make().refreshSession()).toEqual({
      status: 'signed_in',
      session: { userId: 'u1', email: null, accessToken: 'new' },
    });
  });

  it('reads the stored session, not signed_out, when another tab rotated the token mid-refresh', async () => {
    auth.refreshSession.mockResolvedValue({
      data: { session: null },
      error: new AuthRefreshDiscardedError(),
    });
    auth.getSession.mockResolvedValue({
      data: { session: { access_token: 'rotated', user: { id: 'u1', email: null } } },
      error: null,
    });
    expect(await make().refreshSession()).toEqual({
      status: 'signed_in',
      session: { userId: 'u1', email: null, accessToken: 'rotated' },
    });
  });

  it('returns signed_out when the refresh is rejected', async () => {
    auth.refreshSession.mockResolvedValue({
      data: { session: null },
      error: apiError(400, 'refresh_token_not_found'),
    });
    expect(await make().refreshSession()).toEqual({ status: 'signed_out' });
  });

  it('returns offline, never signed_out, for no network, a 5xx, or a thrown fetch error', async () => {
    auth.refreshSession.mockResolvedValueOnce({ data: { session: null }, error: offlineError() });
    expect(await make().refreshSession()).toEqual({ status: 'offline' });
    auth.refreshSession.mockResolvedValueOnce({
      data: { session: null },
      error: new AuthRetryableFetchError('down', 503),
    });
    expect(await make().refreshSession()).toEqual({ status: 'offline' });
    auth.refreshSession.mockRejectedValueOnce(new TypeError('fetch failed'));
    expect(await make().refreshSession()).toEqual({ status: 'offline' });
  });
});

describe('auto refresh', () => {
  it('delegates start and stop to supabase-js', async () => {
    auth.startAutoRefresh.mockResolvedValue(undefined);
    auth.stopAutoRefresh.mockResolvedValue(undefined);
    const client = make();
    await client.startAutoRefresh();
    expect(auth.startAutoRefresh).toHaveBeenCalledTimes(1);
    expect(auth.stopAutoRefresh).not.toHaveBeenCalled();
    await client.stopAutoRefresh();
    expect(auth.stopAutoRefresh).toHaveBeenCalledTimes(1);
  });
});

describe('profile', () => {
  const profile = {
    id: 'u1',
    senderName: 'Sam',
    contactSource: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };
  const signedIn = () =>
    auth.getSession.mockResolvedValue({
      data: {
        session: { access_token: 'tok', user: { id: 'u1', email: 'a@b.c' } },
      },
      error: null,
    });

  it('GETs /me/profile with the bearer token', async () => {
    signedIn();
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify(profile), { status: 200 }),
    );
    expect(await make().getProfile()).toEqual({ ok: true, profile });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:3001/me/profile');
    expect(init.headers.Authorization).toBe('Bearer tok');
    expect(init.body).toBeUndefined();
  });

  it('PUTs only the update body', async () => {
    signedIn();
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify(profile), { status: 200 }),
    );
    await make().updateProfile({ senderName: 'Sam' });
    const [, init] = fetchMock.mock.calls[0];
    expect(init.method).toBe('PUT');
    expect(JSON.parse(init.body)).toEqual({ senderName: 'Sam' });
    expect(init.headers.Authorization).toBe('Bearer tok');
  });

  it('returns signed_out without calling the network when there is no session', async () => {
    auth.getSession.mockResolvedValue({ data: { session: null }, error: null });
    expect(await make().getProfile()).toEqual({
      ok: false,
      reason: 'signed_out',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns offline, not signed_out, when the session cannot refresh offline', async () => {
    auth.getSession.mockResolvedValue({
      data: { session: null },
      error: offlineError(),
    });
    expect(await make().getProfile()).toEqual({ ok: false, reason: 'offline' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    [401, 'signed_out'],
    [404, 'no_profile'],
    [400, 'invalid'],
    [503, 'unavailable'],
    [500, 'failed'],
  ])('maps gateway %i to %s', async (status, reason) => {
    signedIn();
    fetchMock.mockResolvedValueOnce(new Response('{"error":"x"}', { status }));
    expect(await make().getProfile()).toEqual({ ok: false, reason });
  });

  it('maps a fetch TypeError to offline but a malformed 200 body to failed', async () => {
    signedIn();
    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'));
    expect(await make().getProfile()).toEqual({ ok: false, reason: 'offline' });
    fetchMock.mockResolvedValueOnce(new Response('not json', { status: 200 }));
    expect(await make().getProfile()).toEqual({ ok: false, reason: 'failed' });
  });
});

describe('requestPasswordReset', () => {
  it('asks Supabase to redirect back to the origin it was given', async () => {
    auth.resetPasswordForEmail.mockResolvedValue({ data: {}, error: null });
    expect(
      await make().requestPasswordReset('a@b.c', 'https://web.example.com'),
    ).toEqual({ ok: true });
    expect(auth.resetPasswordForEmail).toHaveBeenCalledWith('a@b.c', {
      redirectTo: 'https://web.example.com/?reset=1',
    });
  });

  it('answers ok for an email with no account (non-enumerating)', async () => {
    auth.resetPasswordForEmail.mockResolvedValue({
      data: null,
      error: apiError(400, 'user_not_found'),
    });
    expect(await make().requestPasswordReset('no@one.c', 'http://o')).toEqual({
      ok: true,
    });
  });

  it.each([
    [apiError(429, 'over_email_send_rate_limit'), 'rate_limited'],
    [apiError(429, 'over_request_rate_limit'), 'rate_limited'],
    [apiError(400, 'validation_failed'), 'invalid_email'],
    [apiError(422, 'email_address_invalid'), 'invalid_email'],
    [offlineError(), 'offline'],
    [new AuthRetryableFetchError('down', 503), 'unavailable'],
    [apiError(500, 'unexpected_failure'), 'unavailable'],
    [apiError(400, 'something_else'), 'failed'],
  ])('maps %# to %s', async (error, reason) => {
    auth.resetPasswordForEmail.mockResolvedValue({ data: null, error });
    expect(await make().requestPasswordReset('a@b.c', 'http://o')).toEqual({
      ok: false,
      reason,
    });
  });

  it('turns a thrown fetch failure into offline', async () => {
    auth.resetPasswordForEmail.mockRejectedValue(new TypeError('fetch'));
    expect(await make().requestPasswordReset('a@b.c', 'http://o')).toEqual({
      ok: false,
      reason: 'offline',
    });
  });
});

describe('consumeRecoveryFromUrl', () => {
  const link =
    'https://app.example.com/?reset=1#access_token=at&refresh_token=rt&expires_in=3600&type=recovery';

  it('stores the session from an implicit-flow recovery link', async () => {
    auth.setSession.mockResolvedValue({ data: {}, error: null });
    expect(await make().consumeRecoveryFromUrl(link)).toEqual({ ok: true });
    expect(auth.setSession).toHaveBeenCalledWith({
      access_token: 'at',
      refresh_token: 'rt',
    });
  });

  it('reports an expired link when Supabase put an error in the fragment', async () => {
    expect(
      await make().consumeRecoveryFromUrl(
        'https://app.example.com/?reset=1#error=access_denied&error_code=otp_expired&error_description=x',
      ),
    ).toEqual({ ok: false, reason: 'expired_link' });
    expect(auth.setSession).not.toHaveBeenCalled();
  });

  it('reports an expired link when the marker has no token behind it', async () => {
    expect(
      await make().consumeRecoveryFromUrl('https://app.example.com/?reset=1'),
    ).toEqual({ ok: false, reason: 'expired_link' });
  });

  it('ignores a token that is not a recovery token', async () => {
    expect(
      await make().consumeRecoveryFromUrl(
        'https://app.example.com/#access_token=at&refresh_token=rt&type=signup',
      ),
    ).toEqual({ ok: false, reason: 'no_recovery' });
    expect(auth.setSession).not.toHaveBeenCalled();
  });

  it('says there is no recovery link in an ordinary URL', async () => {
    expect(await make().consumeRecoveryFromUrl('https://app.example.com/')).toEqual({
      ok: false,
      reason: 'no_recovery',
    });
    expect(await make().consumeRecoveryFromUrl('not a url')).toEqual({
      ok: false,
      reason: 'no_recovery',
    });
  });

  it('treats a rejected token as expired and a dead network as offline', async () => {
    auth.setSession.mockResolvedValueOnce({
      data: {},
      error: apiError(401, 'bad_jwt'),
    });
    expect(await make().consumeRecoveryFromUrl(link)).toEqual({
      ok: false,
      reason: 'expired_link',
    });
    auth.setSession.mockResolvedValueOnce({ data: {}, error: offlineError() });
    expect(await make().consumeRecoveryFromUrl(link)).toEqual({
      ok: false,
      reason: 'offline',
    });
  });
});

describe('completePasswordReset', () => {
  it('sets the new password', async () => {
    auth.updateUser.mockResolvedValue({ data: {}, error: null });
    expect(await make().completePasswordReset('new-password-1')).toEqual({
      ok: true,
    });
    expect(auth.updateUser).toHaveBeenCalledWith({ password: 'new-password-1' });
  });

  it.each([
    [apiError(422, 'weak_password'), 'weak_password'],
    [apiError(422, 'same_password'), 'weak_password'],
    [new AuthSessionMissingError(), 'expired_link'],
    [apiError(401, 'bad_jwt'), 'expired_link'],
    [apiError(403, 'session_not_found'), 'expired_link'],
    [apiError(429, 'over_request_rate_limit'), 'rate_limited'],
    [offlineError(), 'offline'],
    [apiError(500, 'unexpected_failure'), 'unavailable'],
    [apiError(400, 'something_else'), 'failed'],
  ])('maps %# to %s', async (error, reason) => {
    auth.updateUser.mockResolvedValue({ data: {}, error });
    expect(await make().completePasswordReset('pw')).toEqual({
      ok: false,
      reason,
    });
  });
});
