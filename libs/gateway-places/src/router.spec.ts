import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import { placesRouter, readServerKey, INVALID_BODY, NOT_SET_UP, UNAVAILABLE } from './router.js';
import { PLACES_RATE_LIMITED, PLACES_RATE_LIMIT_BINDING } from './rateLimit.js';

const KEY = 'test-places-key-not-real';
const token = 'abcdefghijklmnop1234';
const app = new Hono().route('/', placesRouter);

const post = (path: string, body: unknown, env?: unknown, headers: Record<string, string> = {}) =>
  app.request(
    path,
    { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json', ...headers } },
    env,
  );
const suggestBody = { input: 'Smith Funeral', types: ['funeral_home'], sessionToken: token };
const detailsBody = { placeId: 'ChIJabc123', sessionToken: token };

const fetchMock = vi.fn();
const googleJson = (data: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(data), { status }));
const sentInit = () => fetchMock.mock.calls[0]?.[1] as RequestInit & { headers: Record<string, string> };

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  vi.stubEnv('GOOGLE_PLACES_SERVER_KEY', KEY);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const prediction = (id: string, text: string, main?: string, secondary?: string) => ({
  placePrediction: {
    placeId: id,
    text: { text },
    ...(main === undefined ? {} : { structuredFormat: { mainText: { text: main }, secondaryText: { text: secondary ?? '' } } }),
  },
});

describe('POST /places/suggest', () => {
  it('maps Google predictions, strips USA, drops query predictions and falls back to text', async () => {
    fetchMock.mockReturnValue(
      googleJson({
        suggestions: [
          prediction('p1', 'Smith Funeral Home, 1 Main St, Tulsa, OK, USA', 'Smith Funeral Home', '1 Main St, Tulsa, OK, USA'),
          { queryPrediction: { text: { text: 'smith funeral' } } },
          prediction('p2', 'Jones Chapel, Tulsa, OK, USA'),
        ],
      }),
    );
    const res = await post('/places/suggest', suggestBody);
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(await res.json()).toEqual({
      suggestions: [
        { id: 'p1', text: 'Smith Funeral Home, 1 Main St, Tulsa, OK', mainText: 'Smith Funeral Home', secondaryText: '1 Main St, Tulsa, OK' },
        { id: 'p2', text: 'Jones Chapel, Tulsa, OK', mainText: 'Jones Chapel, Tulsa, OK', secondaryText: '' },
      ],
    });
  });

  it('caps the list at 5', async () => {
    fetchMock.mockReturnValue(
      googleJson({ suggestions: Array.from({ length: 8 }, (_, i) => prediction(`p${i}`, `Place ${i}`, `Place ${i}`)) }),
    );
    const body = (await (await post('/places/suggest', suggestBody)).json()) as { suggestions: unknown[] };
    expect(body.suggestions).toHaveLength(5);
  });

  it('sends the key in a header only, the exact field mask, and the fixed request fields', async () => {
    fetchMock.mockReturnValue(googleJson({}));
    await post('/places/suggest', suggestBody);
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toBe('https://places.googleapis.com/v1/places:autocomplete');
    expect(url).not.toContain(KEY);
    const init = sentInit();
    expect(init.headers['X-Goog-Api-Key']).toBe(KEY);
    expect(init.headers['X-Goog-FieldMask']).toBe(
      'suggestions.placePrediction.placeId,suggestions.placePrediction.text.text,suggestions.placePrediction.structuredFormat',
    );
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(JSON.parse(init.body as string)).toEqual({
      input: 'Smith Funeral',
      sessionToken: token,
      regionCode: 'us',
      languageCode: 'en-US',
      includedPrimaryTypes: ['funeral_home'],
    });
  });

  it('leaves includedPrimaryTypes out when there are no types', async () => {
    fetchMock.mockReturnValue(googleJson({}));
    await post('/places/suggest', { input: 'abc', sessionToken: token });
    expect(JSON.parse(sentInit().body as string)).not.toHaveProperty('includedPrimaryTypes');
  });

  it('answers 400 without calling Google for a bad body, even with no key', async () => {
    vi.stubEnv('GOOGLE_PLACES_SERVER_KEY', '');
    const res = await post('/places/suggest', { input: 'ab', sessionToken: token });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: INVALID_BODY });
    expect((await app.request('/places/suggest', { method: 'POST' })).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('answers 503 without calling Google when there is no key', async () => {
    vi.stubEnv('GOOGLE_PLACES_SERVER_KEY', '  ');
    const res = await post('/places/suggest', suggestBody);
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: NOT_SET_UP });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([403, 429, 500])('answers 502 when Google answers %s', async (status) => {
    fetchMock.mockReturnValue(googleJson({ error: 'x' }, status));
    const res = await post('/places/suggest', suggestBody);
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: UNAVAILABLE });
  });

  it('answers 502 on a thrown fetch, a timeout and bad JSON', async () => {
    fetchMock.mockRejectedValueOnce(new Error('network'));
    expect((await post('/places/suggest', suggestBody)).status).toBe(502);
    fetchMock.mockRejectedValueOnce(new DOMException('timed out', 'TimeoutError'));
    expect((await post('/places/suggest', suggestBody)).status).toBe(502);
    fetchMock.mockReturnValueOnce(Promise.resolve(new Response('not json', { status: 200 })));
    expect((await post('/places/suggest', suggestBody)).status).toBe(502);
  });

  it('refuses a 3 KB body with 413 and no Google call', async () => {
    for (const path of ['/places/suggest', '/places/details']) {
      const res = await post(path, { input: 'a'.repeat(3000), sessionToken: token });
      expect(res.status).toBe(413);
      expect(await res.json()).toEqual({ error: INVALID_BODY });
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('gives Google a 5 second timeout signal', async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout');
    fetchMock.mockReturnValue(googleJson({}));
    await post('/places/suggest', suggestBody);
    expect(timeout).toHaveBeenCalledWith(5000);
  });

  it('never logs the typed text, the place id or the key', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) => vi.spyOn(console, m));
    fetchMock.mockRejectedValue(new Error('network'));
    await post('/places/suggest', suggestBody);
    await post('/places/details', detailsBody);
    for (const spy of spies) {
      expect(spy).not.toHaveBeenCalled();
    }
  });
});

describe('POST /places/details', () => {
  it('maps the name and address, strips USA, and sends a GET with the key in a header', async () => {
    fetchMock.mockReturnValue(
      googleJson({ displayName: { text: 'Smith Funeral Home' }, formattedAddress: '1 Main St, Tulsa, OK 74103, USA' }),
    );
    const res = await post('/places/details', detailsBody);
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(await res.json()).toEqual({ name: 'Smith Funeral Home', address: '1 Main St, Tulsa, OK 74103' });
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toBe(
      `https://places.googleapis.com/v1/places/ChIJabc123?sessionToken=${token}&languageCode=en-US&regionCode=us`,
    );
    expect(url).not.toContain(KEY);
    expect(sentInit().method).toBe('GET');
    expect(sentInit().headers['X-Goog-Api-Key']).toBe(KEY);
    expect(sentInit().headers['X-Goog-FieldMask']).toBe('displayName,formattedAddress');
  });

  it('gives an empty name when Google sends none', async () => {
    fetchMock.mockReturnValue(googleJson({ formattedAddress: '1 Main St, Tulsa, OK, USA' }));
    expect(await (await post('/places/details', detailsBody)).json()).toEqual({ name: '', address: '1 Main St, Tulsa, OK' });
  });

  it('answers 502 when there is no address', async () => {
    fetchMock.mockReturnValue(googleJson({ displayName: { text: 'X' } }));
    const res = await post('/places/details', detailsBody);
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: UNAVAILABLE });
  });

  it.each([
    ['a bad place id', { placeId: 'a/b', sessionToken: token }],
    ['nothing', {}],
  ])('answers 400 for %s with no Google call', async (_n, body) => {
    expect((await post('/places/details', body)).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('answers 503 with no key', async () => {
    vi.stubEnv('GOOGLE_PLACES_SERVER_KEY', '');
    expect((await post('/places/details', detailsBody)).status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('readServerKey', () => {
  it('reads GOOGLE_PLACES_SERVER_KEY from process.env on each call, trimmed, like the identity secrets', () => {
    vi.stubEnv('GOOGLE_PLACES_SERVER_KEY', '  abc  ');
    expect(readServerKey()).toBe('abc');
    vi.stubEnv('GOOGLE_PLACES_SERVER_KEY', 'next');
    expect(readServerKey()).toBe('next');
    vi.stubEnv('GOOGLE_PLACES_SERVER_KEY', '   ');
    expect(readServerKey()).toBeUndefined();
  });
});

describe('rate limit', () => {
  const binding = (success: boolean) => ({ limit: vi.fn(async (_o: { key: string }) => ({ success })) });
  const envWith = (b: unknown) => ({ [PLACES_RATE_LIMIT_BINDING]: b });
  const ip = { 'cf-connecting-ip': '203.0.113.9' };

  it('answers 429 with Retry-After and no Google call when over the limit', async () => {
    const b = binding(false);
    const res = await post('/places/suggest', suggestBody, envWith(b), ip);
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('60');
    expect(await res.json()).toEqual({ error: PLACES_RATE_LIMITED });
    expect(b.limit).toHaveBeenCalledWith({ key: 'ip:203.0.113.9' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('limits details in the same bucket', async () => {
    const res = await post('/places/details', detailsBody, envWith(binding(false)), ip);
    expect(res.status).toBe(429);
  });

  it.each([
    ['no binding', undefined, ip],
    ['no ip', envWith(binding(false)), {}],
    ['a binding that throws', envWith({ limit: async () => { throw new Error('down'); } }), ip],
  ])('lets the request through with %s', async (_n, env, headers) => {
    fetchMock.mockReturnValue(googleJson({}));
    const res = await post('/places/suggest', suggestBody, env, headers);
    expect(res.status).toBe(200);
  });
});
