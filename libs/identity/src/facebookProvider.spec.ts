import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFacebookProvider } from './facebookProvider.js';

describe('facebookProvider', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('builds an authorization URL with the app id, redirect, state, and scope', () => {
    const provider = createFacebookProvider('app123', 'secret');
    const url = new URL(provider.authorizationUrl({ state: 'state123', redirectUri: 'https://gw.example/cb' }));
    expect(url.origin + url.pathname).toBe('https://www.facebook.com/v21.0/dialog/oauth');
    expect(url.searchParams.get('client_id')).toBe('app123');
    expect(url.searchParams.get('redirect_uri')).toBe('https://gw.example/cb');
    expect(url.searchParams.get('state')).toBe('state123');
    expect(url.searchParams.get('scope')).toBe('public_profile,email');
  });

  it('exchanges a code for an access token', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ access_token: 'tok' }) });
    vi.stubGlobal('fetch', fetchMock);

    const provider = createFacebookProvider('app123', 'secret');
    const result = await provider.exchangeCode({ code: 'abc', redirectUri: 'https://gw.example/cb' });
    expect(result.accessToken).toBe('tok');
    const calledUrl = new URL(fetchMock.mock.calls[0][0] as string);
    expect(calledUrl.searchParams.get('code')).toBe('abc');
    expect(calledUrl.searchParams.get('client_secret')).toBe('secret');
  });

  it('throws when Facebook rejects the code', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
    const provider = createFacebookProvider('app123', 'secret');
    await expect(provider.exchangeCode({ code: 'bad', redirectUri: 'https://gw.example/cb' })).rejects.toThrow();
  });

  it('normalizes a profile, treating a returned email as verified', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: 'fb1', name: 'Ada', email: 'ada@example.com' }) }),
    );
    const provider = createFacebookProvider('app123', 'secret');
    const profile = await provider.fetchProfile({ accessToken: 'tok' });
    expect(profile).toEqual({
      providerSub: 'fb1',
      email: 'ada@example.com',
      emailVerified: true,
      name: 'Ada',
    });
  });

  it('normalizes a profile with no email as unverified/null', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: 'fb1', name: 'Ada' }) }));
    const provider = createFacebookProvider('app123', 'secret');
    const profile = await provider.fetchProfile({ accessToken: 'tok' });
    expect(profile.email).toBeNull();
    expect(profile.emailVerified).toBe(false);
  });
});
