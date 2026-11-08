import { configureApiClient } from './client.js';
import { newPlaceSessionToken, placeDetails, PlacesError, suggestPlaces } from './places.js';

const fetchMock = vi.fn();
const TOKEN = '0123456789abcdef0123456789abcdef';

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  configureApiClient({ baseUrl: 'https://gw.test' });
});

afterEach(() => {
  vi.unstubAllGlobals();
  configureApiClient({ baseUrl: undefined });
});

describe('suggestPlaces', () => {
  it('posts the trimmed text, the types and the token to /places/suggest', async () => {
    const suggestions = [{ id: 'p1', text: 'A, B', mainText: 'A', secondaryText: 'B' }];
    fetchMock.mockResolvedValue(json(200, { suggestions }));
    await expect(suggestPlaces('  elm  ', ['funeral_home', 'church'], TOKEN)).resolves.toEqual(suggestions);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://gw.test/places/suggest');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ input: 'elm', types: ['funeral_home', 'church'], sessionToken: TOKEN });
  });

  it('leaves types out when there are none', async () => {
    fetchMock.mockResolvedValue(json(200, { suggestions: [] }));
    await suggestPlaces('elm', [], TOKEN);
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(init.body as string)).toEqual({ input: 'elm', sessionToken: TOKEN });
  });

  it.each([
    [503, 'not_set_up'],
    [429, 'rate_limited'],
    [400, 'invalid'],
    [413, 'too_large'],
    [502, 'unavailable'],
    [500, 'unavailable'],
  ])('rejects a %i with a typed error (%s)', async (status, reason) => {
    fetchMock.mockResolvedValue(json(status, { error: 'x' }));
    const error = await suggestPlaces('elm', [], TOKEN).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PlacesError);
    expect(error).toMatchObject({ reason, status });
  });

  it('rejects a network failure as offline', async () => {
    fetchMock.mockRejectedValue(new TypeError('Network request failed'));
    await expect(suggestPlaces('elm', [], TOKEN)).rejects.toMatchObject({ reason: 'offline' });
  });

  it('rejects an unreadable 200 body as unavailable', async () => {
    fetchMock.mockResolvedValue(new Response('not json', { status: 200 }));
    await expect(suggestPlaces('elm', [], TOKEN)).rejects.toMatchObject({ reason: 'unavailable' });
  });

  it('passes an abort through unchanged', async () => {
    const abort = new DOMException('aborted', 'AbortError');
    fetchMock.mockRejectedValue(abort);
    await expect(suggestPlaces('elm', [], TOKEN)).rejects.toBe(abort);
  });
});

describe('placeDetails', () => {
  it('posts the id and token to /places/details', async () => {
    fetchMock.mockResolvedValue(json(200, { name: 'Elm Chapel', address: '1 Elm St, Town, ST 12345' }));
    await expect(placeDetails('abc_123', TOKEN)).resolves.toEqual({ name: 'Elm Chapel', address: '1 Elm St, Town, ST 12345' });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://gw.test/places/details');
    expect(JSON.parse(init.body as string)).toEqual({ placeId: 'abc_123', sessionToken: TOKEN });
  });

  it('rejects a 502 with a typed error', async () => {
    fetchMock.mockResolvedValue(json(502, { error: 'x' }));
    await expect(placeDetails('abc', TOKEN)).rejects.toMatchObject({ reason: 'unavailable', status: 502 });
  });
});

describe('newPlaceSessionToken', () => {
  const valid = /^[A-Za-z0-9_-]{16,36}$/;

  it('uses randomUUID when the runtime has it', () => {
    vi.stubGlobal('crypto', { randomUUID: () => '123e4567-e89b-42d3-a456-426614174000' });
    expect(newPlaceSessionToken()).toBe('123e4567-e89b-42d3-a456-426614174000');
  });

  it('falls back to a token the gateway accepts when randomUUID is missing', () => {
    vi.stubGlobal('crypto', {});
    const token = newPlaceSessionToken();
    expect(token).toMatch(valid);
    expect(newPlaceSessionToken()).not.toBe(token);
  });
});
