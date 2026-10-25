import { afterEach, describe, expect, it, vi } from 'vitest';
import { DATA_USER_TOKEN_HEADER } from '@griever/shared';
import { DataFunctionError, callData } from './dataFunction.js';

const TOKEN = 'user-token-secret-123';
const REMOTE = {
  url: 'https://abc.lambda-url.us-east-1.on.aws',
  region: 'us-east-1',
  accessKeyId: 'AKIAEXAMPLE',
  secretAccessKey: 'secret-key-example',
};

afterEach(() => vi.unstubAllGlobals());

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

/** Stubs fetch and returns a reader for what was sent, whether as (url, init) or a Request. */
function stubFetch(res: Response) {
  const fetchMock = vi.fn().mockResolvedValue(res);
  vi.stubGlobal('fetch', fetchMock);
  return {
    fetchMock,
    sent() {
      const [input, init] = fetchMock.mock.calls[0];
      const req = input instanceof Request ? input : new Request(input, init);
      return req;
    },
  };
}

describe('callData signing', () => {
  it('signs a remote call with SigV4 for service lambda', async () => {
    const f = stubFetch(json({ ok: true, data: 1 }));
    await callData(REMOTE, TOKEN, 'getProfile', {});
    const req = f.sent();
    expect(req.url).toBe(`${REMOTE.url}/v1`);
    expect(req.method).toBe('POST');
    const auth = req.headers.get('authorization') ?? '';
    expect(auth).toMatch(/^AWS4-HMAC-SHA256 /);
    expect(auth).toContain('/us-east-1/lambda/aws4_request');
    expect(req.headers.get('x-amz-date')).toMatch(/^\d{8}T\d{6}Z$/);
    expect(await req.json()).toEqual({ action: 'getProfile', args: {} });
  });

  it('puts the user token only in x-gg-user-token', async () => {
    const f = stubFetch(json({ ok: true, data: null }));
    await callData(REMOTE, TOKEN, 'listFlows', {});
    const req = f.sent();
    expect(req.headers.get(DATA_USER_TOKEN_HEADER)).toBe(TOKEN);
    expect(req.headers.get('authorization')).not.toContain(TOKEN);
    req.headers.forEach((value, name) => {
      if (name !== DATA_USER_TOKEN_HEADER) {
        expect(value).not.toContain(TOKEN);
      }
    });
    expect(await req.text()).not.toContain(TOKEN);
  });

  it('never puts the token in Authorization, even when nothing signs the request', async () => {
    const f = stubFetch(json({ ok: true, data: null }));
    await callData({ url: 'http://localhost:3002', region: 'us-east-1' }, TOKEN, 'getProfile');
    expect(f.sent().headers.get('authorization')).toBeNull();
  });

  it.each(['http://localhost:3002', 'http://127.0.0.1:3002', 'http://[::1]:3002'])(
    'calls loopback %s unsigned',
    async (url) => {
      const f = stubFetch(json({ ok: true, data: null }));
      await callData({ url, region: 'us-east-1' }, TOKEN, 'listFlows', {});
      const req = f.sent();
      expect(req.url.endsWith('/v1')).toBe(true);
      expect(req.headers.get('authorization')).toBeNull();
      expect(req.headers.get('x-amz-date')).toBeNull();
      expect(req.headers.get(DATA_USER_TOKEN_HEADER)).toBe(TOKEN);
    },
  );

  it('throws before any request when a non-loopback url has no key pair', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(callData({ url: REMOTE.url, region: 'us-east-1' }, TOKEN, 'getProfile')).rejects.toBeInstanceOf(
      DataFunctionError,
    );
    await expect(
      callData({ url: REMOTE.url, region: 'us-east-1', accessKeyId: 'a' }, TOKEN, 'getProfile'),
    ).rejects.toBeInstanceOf(DataFunctionError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('throws before any request when the key pair is empty strings', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(
      callData({ url: REMOTE.url, region: 'us-east-1', accessKeyId: '', secretAccessKey: '' }, TOKEN, 'getProfile'),
    ).rejects.toThrow(/key pair/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects a non-loopback http url before any request', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(callData({ ...REMOTE, url: 'http://abc.example.com' }, TOKEN, 'getProfile')).rejects.toThrow(
      /must use https/,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    'https://abc.example.com/prod',
    'https://abc.example.com/?x=1',
    'https://abc.example.com/#frag',
    'http://localhost:3002/api',
  ])('rejects a config url with a path, query or hash: %s', async (url) => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(callData({ ...REMOTE, url }, TOKEN, 'getProfile')).rejects.toThrow(/no path, query or hash/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('accepts a trailing slash on the origin', async () => {
    const f = stubFetch(json({ ok: true, data: null }));
    await callData({ ...REMOTE, url: `${REMOTE.url}/` }, TOKEN, 'getProfile');
    expect(f.sent().url).toBe(`${REMOTE.url}/v1`);
  });

  it.each(['http://127.0.0.1.nip.io', 'http://localhost@evil.example', 'http://localhost.'])(
    'does not treat %s as loopback',
    async (url) => {
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);
      await expect(callData({ url, region: 'us-east-1' }, TOKEN, 'getProfile')).rejects.toBeInstanceOf(
        DataFunctionError,
      );
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it('treats an upper-case LOCALHOST as loopback', async () => {
    const f = stubFetch(json({ ok: true, data: null }));
    await callData({ url: 'http://LOCALHOST:3002', region: 'us-east-1' }, TOKEN, 'getProfile');
    expect(f.sent().headers.get('authorization')).toBeNull();
  });

  it('does not treat a lookalike host as loopback', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(callData({ url: 'https://localhost.evil.example', region: 'r' }, TOKEN, 'getProfile')).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('callData results', () => {
  it('returns a parsed success', async () => {
    stubFetch(json({ ok: true, data: { id: 'p1' } }));
    await expect(callData(REMOTE, TOKEN, 'getProfile')).resolves.toEqual({ ok: true, data: { id: 'p1' } });
  });

  it('returns a domain failure as a value', async () => {
    stubFetch(json({ ok: false, code: 'already_invited' }));
    await expect(callData(REMOTE, TOKEN, 'createInvite')).resolves.toEqual({ ok: false, code: 'already_invited' });
  });

  it('maps 401 to unauthorized', async () => {
    stubFetch(json({ error: 'x' }, 401));
    await expect(callData(REMOTE, TOKEN, 'getProfile')).resolves.toEqual({ ok: false, code: 'unauthorized' });
  });

  it.each([403, 500, 502, 503])('throws DataFunctionError on %i', async (status) => {
    stubFetch(json({ message: 'detail' }, status));
    const err = await callData(REMOTE, TOKEN, 'getProfile').catch((e) => e);
    expect(err).toBeInstanceOf(DataFunctionError);
    expect(err.status).toBe(status);
  });

  it('throws on a non-JSON body', async () => {
    stubFetch(new Response('<html>', { status: 200 }));
    await expect(callData(REMOTE, TOKEN, 'getProfile')).rejects.toBeInstanceOf(DataFunctionError);
  });

  it('throws on JSON that is not a DataResult', async () => {
    stubFetch(json({ ok: false, code: 'made_up' }));
    await expect(callData(REMOTE, TOKEN, 'getProfile')).rejects.toBeInstanceOf(DataFunctionError);
  });

  it('throws on a network failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('connect ECONNREFUSED')));
    await expect(callData(REMOTE, TOKEN, 'getProfile')).rejects.toBeInstanceOf(DataFunctionError);
  });

  it('never puts the token or the body in an error message', async () => {
    const leaky = `echo ${TOKEN} secret-body`;
    const cases: Array<() => void> = [
      () => stubFetch(json({ message: leaky }, 500)),
      () => stubFetch(new Response(leaky, { status: 200 })),
      () => stubFetch(json({ ok: false, code: leaky })),
      () => vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error(leaky))),
    ];
    for (const setup of cases) {
      setup();
      const err = await callData(REMOTE, TOKEN, 'getProfile', { note: 'secret-body' }).catch((e) => e);
      expect(err).toBeInstanceOf(DataFunctionError);
      expect(err.message).not.toContain(TOKEN);
      expect(err.message).not.toContain('secret-body');
    }
  });
});
