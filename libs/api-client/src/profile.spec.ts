import type { Profile } from '@griever/shared';
import { getProfile, updateProfile } from './profile.js';

const fetchMock = vi.fn();

const profile: Profile = {
  id: 'u1',
  senderName: 'Peter',
  contactSource: null,
  accountType: 'owner',
  createdAt: 'x',
  updatedAt: 'x',
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('getProfile', () => {
  it('sends the token to /me/profile and returns the profile', async () => {
    fetchMock.mockResolvedValue(json(200, profile));
    expect(await getProfile('tok')).toEqual({ ok: true, profile });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url.endsWith('/me/profile')).toBe(true);
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer tok');
    expect(init.method).toBeUndefined();
  });

  it.each([
    [401, 'signed_out'],
    [404, 'no_profile'],
    [400, 'invalid'],
    [503, 'unavailable'],
    [500, 'failed'],
  ])('maps %i to %s', async (status, reason) => {
    fetchMock.mockResolvedValue(json(status, { error: 'x' }));
    expect(await getProfile('tok')).toEqual({ ok: false, reason });
  });

  it('maps a network failure to offline', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    expect(await getProfile('tok')).toEqual({ ok: false, reason: 'offline' });
  });

  it('maps a malformed 200 body to failed, not offline', async () => {
    fetchMock.mockResolvedValue(new Response('not json', { status: 200 }));
    expect(await getProfile('tok')).toEqual({ ok: false, reason: 'failed' });
  });
});

describe('updateProfile', () => {
  it('PUTs the update with the token', async () => {
    fetchMock.mockResolvedValue(json(200, { ...profile, senderName: 'Pete' }));
    const result = await updateProfile('tok', { senderName: 'Pete' });
    expect(result.ok && result.profile.senderName).toBe('Pete');
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe('PUT');
    expect(init.body).toBe(JSON.stringify({ senderName: 'Pete' }));
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer tok');
  });

  it.each([
    [401, 'signed_out'],
    [400, 'invalid'],
    [503, 'unavailable'],
  ])('maps %i to %s', async (status, reason) => {
    fetchMock.mockResolvedValue(json(status, { error: 'x' }));
    expect(await updateProfile('tok', { senderName: 'P' })).toEqual({ ok: false, reason });
  });

  it('maps a network failure to offline', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    expect(await updateProfile('tok', {})).toEqual({ ok: false, reason: 'offline' });
  });
});
