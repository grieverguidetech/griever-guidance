import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInstagramProvider } from './instagramProvider.js';

describe('instagramProvider', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('builds an authorization URL against instagram.com, not facebook.com', () => {
    const provider = createInstagramProvider('app123', 'secret');
    const url = new URL(provider.authorizationUrl({ state: 'state123', redirectUri: 'https://gw.example/cb' }));
    expect(url.origin + url.pathname).toBe('https://www.instagram.com/oauth/authorize');
    expect(url.searchParams.get('scope')).toBe('instagram_business_basic');
  });

  it('exchanges a code via form-encoded POST and carries the user id forward', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ access_token: 'tok', user_id: 999 }) });
    vi.stubGlobal('fetch', fetchMock);

    const provider = createInstagramProvider('app123', 'secret');
    const result = await provider.exchangeCode({ code: 'abc', redirectUri: 'https://gw.example/cb' });
    expect(result.accessToken).toBe('tok');
    expect(result.extra).toEqual({ userId: '999' });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.instagram.com/oauth/access_token');
    expect(init.method).toBe('POST');
  });

  it('never returns an email — the platform does not provide one', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: 'ig1', username: 'ada' }) }));
    const provider = createInstagramProvider('app123', 'secret');
    const profile = await provider.fetchProfile({ accessToken: 'tok', extra: { userId: 'ig1' } });
    expect(profile).toEqual({ providerSub: 'ig1', email: null, emailVerified: false, name: 'ada' });
  });

  it('throws if the user id from token exchange is missing', async () => {
    const provider = createInstagramProvider('app123', 'secret');
    await expect(provider.fetchProfile({ accessToken: 'tok' })).rejects.toThrow();
  });
});
