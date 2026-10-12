import {
  acceptInvite,
  createInvite,
  getMembers,
  removeMember,
  revokeInvite,
} from './members.js';
import { configureApiClient } from './client.js';

const fetchMock = vi.fn();
const ACCESS = 'access-token-abc';
const INVITE = 'T'.repeat(43);
const ID = '123e4567-e89b-12d3-a456-426614174000';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  configureApiClient({ baseUrl: 'http://gw' });
});
afterEach(() => {
  vi.unstubAllGlobals();
  configureApiClient({ baseUrl: undefined });
});

const lastCall = () => {
  const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
  return { url, init, headers: init.headers as Record<string, string> };
};

const calls: Array<[string, () => Promise<unknown>, string, string]> = [
  ['getMembers', () => getMembers(ACCESS), 'GET', '/members'],
  ['createInvite', () => createInvite(ACCESS, 'a@b.co'), 'POST', '/invites'],
  ['revokeInvite', () => revokeInvite(ACCESS, ID), 'DELETE', `/invites/${ID}`],
  ['removeMember', () => removeMember(ACCESS, ID), 'DELETE', `/members/${ID}`],
  ['acceptInvite', () => acceptInvite(ACCESS, INVITE), 'POST', '/invites/accept'],
];

describe.each(calls)('%s', (_name, run, method, path) => {
  it('sends the method, path and bearer header', async () => {
    fetchMock.mockResolvedValue(json(200, { ownerId: ID }));
    await run();
    const { url, init, headers } = lastCall();
    expect(init.method).toBe(method);
    expect(url).toBe(`http://gw${path}`);
    expect(headers['Authorization']).toBe(`Bearer ${ACCESS}`);
  });

  it('puts no token in the URL', async () => {
    fetchMock.mockResolvedValue(json(200, { ownerId: ID }));
    await run();
    const { url } = lastCall();
    expect(url).not.toContain(ACCESS);
    expect(url).not.toContain(INVITE);
    expect(url).not.toContain('?');
  });

  it.each([
    [401, 'signed_out'],
    [400, 'invalid'],
    [403, 'forbidden'],
    [429, 'rate_limited'],
    [404, 'unusable'],
    [410, 'unusable'],
    [500, 'unavailable'],
    [503, 'unavailable'],
    [418, 'failed'],
  ])('maps status %i to %s', async (status, reason) => {
    fetchMock.mockResolvedValue(json(status, { error: 'x' }));
    expect(await run()).toEqual({ ok: false, reason });
  });

  it('maps a network failure to offline', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    expect(await run()).toEqual({ ok: false, reason: 'offline' });
  });
});

describe('results', () => {
  it('getMembers returns the view', async () => {
    const view = { role: 'member', owner: { id: ID, name: null } };
    fetchMock.mockResolvedValue(json(200, view));
    expect(await getMembers(ACCESS)).toEqual({ ok: true, view });
  });

  it('createInvite sends the email in the body and returns the invite', async () => {
    const invite = { id: ID, email: 'a@b.co', expiresAt: '2026-10-18T00:00:00Z' };
    fetchMock.mockResolvedValue(json(201, invite));
    expect(await createInvite(ACCESS, 'a@b.co')).toEqual({ ok: true, invite });
    expect(JSON.parse(lastCall().init.body as string)).toEqual({ email: 'a@b.co' });
  });

  it('acceptInvite sends the token in the body and returns the owner id', async () => {
    fetchMock.mockResolvedValue(json(200, { ownerId: ID }));
    expect(await acceptInvite(ACCESS, INVITE)).toEqual({ ok: true, ownerId: ID });
    expect(JSON.parse(lastCall().init.body as string)).toEqual({ token: INVITE });
  });

  it('a failed result never carries the invite token', async () => {
    fetchMock.mockResolvedValue(json(404, { error: `bad ${INVITE}` }));
    const result = await acceptInvite(ACCESS, INVITE);
    expect(JSON.stringify(result)).not.toContain(INVITE);
  });

  it('revoke and remove succeed on an empty 204', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    expect(await revokeInvite(ACCESS, ID)).toEqual({ ok: true });
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    expect(await removeMember(ACCESS, ID)).toEqual({ ok: true });
  });

  it('a malformed 200 body from getMembers is failed, not offline', async () => {
    fetchMock.mockResolvedValue(new Response('<html>', { status: 200 }));
    expect(await getMembers(ACCESS)).toEqual({ ok: false, reason: 'failed' });
  });
});
