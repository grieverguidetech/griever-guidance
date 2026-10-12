import { createFlow, listFlows, patchFlow } from './flows.js';
import { configureApiClient } from './client.js';
import type { FlowFacts } from '@griever/shared';

const fetchMock = vi.fn();
const ACCESS = 'access-token-abc';
const ID = '123e4567-e89b-12d3-a456-426614174000';
const OWNER = '223e4567-e89b-12d3-a456-426614174000';

const facts: FlowFacts = {
  personName: 'Margaret Hale',
  dateOfPassing: null,
  serviceDate: 'June 3',
  obituaryUrl: null,
  obituaryPublisher: null,
  serviceReady: true,
};
const record = {
  id: ID,
  ownerId: OWNER,
  role: 'owner',
  facts,
  updatedAt: '2026-10-12T10:00:00Z',
  updatedBy: OWNER,
};

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

const firstCall = () => {
  const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
  return { url, init, headers: init.headers as Record<string, string> };
};

const calls: Array<[string, () => Promise<unknown>, string, string, unknown]> = [
  ['listFlows', () => listFlows(ACCESS), 'GET', '/flows', [record]],
  ['createFlow', () => createFlow(ACCESS, ID, facts), 'POST', '/flows', record],
  ['patchFlow', () => patchFlow(ACCESS, ID, { serviceReady: true }), 'PATCH', `/flows/${ID}`, record],
];

describe.each(calls)('%s', (_name, run, method, path, okBody) => {
  it('sends the method, path and bearer header, with no token in the URL', async () => {
    fetchMock.mockResolvedValue(json(200, okBody));
    await run();
    const { url, init, headers } = firstCall();
    expect(init.method).toBe(method);
    expect(url).toBe(`http://gw${path}`);
    expect(headers['Authorization']).toBe(`Bearer ${ACCESS}`);
    expect(url).not.toContain(ACCESS);
  });

  it.each([
    [401, 'signed_out'],
    [403, 'forbidden'],
    [404, 'not_found'],
    [400, 'invalid'],
    [422, 'invalid'],
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

  it('maps an unreadable reply to failed', async () => {
    fetchMock.mockResolvedValue(new Response('not json', { status: 200 }));
    expect(await run()).toEqual({ ok: false, reason: 'failed' });
  });

  it('does not leak the token in a failure', async () => {
    fetchMock.mockResolvedValue(json(500, { error: `boom ${ACCESS}` }));
    expect(JSON.stringify(await run())).not.toContain(ACCESS);
  });
});

describe('listFlows', () => {
  it('returns validated records and drops invalid ones', async () => {
    fetchMock.mockResolvedValue(json(200, [record, { ...record, id: 'bad' }]));
    expect(await listFlows(ACCESS)).toEqual({ ok: true, flows: [record] });
  });
  it('fails when the reply is not a list', async () => {
    fetchMock.mockResolvedValue(json(200, { flows: [] }));
    expect(await listFlows(ACCESS)).toEqual({ ok: false, reason: 'failed' });
  });
});

describe('createFlow and patchFlow', () => {
  it('create sends the id and facts as the body and returns the record', async () => {
    fetchMock.mockResolvedValue(json(200, record));
    expect(await createFlow(ACCESS, ID, facts)).toEqual({ ok: true, flow: record });
    expect(JSON.parse(firstCall().init.body as string)).toEqual({ id: ID, ...facts });
    expect(firstCall().headers['Prefer']).toBeUndefined();
  });

  it('patch sends only the given fields', async () => {
    fetchMock.mockResolvedValue(json(200, record));
    await patchFlow(ACCESS, ID, { serviceDate: 'June 4' });
    expect(JSON.parse(firstCall().init.body as string)).toEqual({ serviceDate: 'June 4' });
  });

  it('never sends a non-fact key even if the caller passes a whole session (C2/C3)', async () => {
    fetchMock.mockResolvedValue(json(200, record));
    const session = {
      ...facts,
      senderName: 'Anna',
      drafts: { announce: {} },
      selectedContactIds: ['c1'],
      messageOverride: 'my words',
      recipientsNotified: { announce: ['c1'] },
    };
    await createFlow(ACCESS, ID, session);
    const body = firstCall().init.body as string;
    expect(Object.keys(JSON.parse(body)).sort()).toEqual(['id', ...Object.keys(facts)].sort());
    for (const s of ['Anna', 'c1', 'my words']) expect(body).not.toContain(s);
  });

  it('rejects a non-uuid id without making a request', async () => {
    expect(await createFlow(ACCESS, '../members', facts)).toEqual({ ok: false, reason: 'invalid' });
    expect(await patchFlow(ACCESS, 'x', {})).toEqual({ ok: false, reason: 'invalid' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
