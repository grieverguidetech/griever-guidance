import { ApiError, apiFetch, apiFetchNoContent, configureApiClient, generateObituary } from './client.js';

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => vi.unstubAllGlobals());

function respond(status: number, body: unknown) {
  fetchMock.mockResolvedValueOnce(
    new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, statusText: 'Status' }),
  );
}

describe('api-client', () => {
  it('posts JSON to the gateway and returns the parsed body', async () => {
    respond(200, { draft: 'words' });
    const result = await generateObituary({ fullName: 'A', dateOfBirth: '1', dateOfPassing: '2' });

    expect(result).toEqual({ draft: 'words' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:3001/obituary');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ fullName: 'A', dateOfBirth: '1', dateOfPassing: '2' });
    expect(init.headers['Content-Type']).toBe('application/json');
  });

  it('keeps Content-Type when a caller adds its own headers', async () => {
    respond(200, { userId: 'u1' });
    await apiFetch('/x', { headers: { Authorization: 'Bearer tok' } });
    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers).toEqual({ 'Content-Type': 'application/json', Authorization: 'Bearer tok' });
  });

  it("surfaces the gateway's error message", async () => {
    respond(400, { error: 'Something went wrong.' });
    await expect(apiFetch('/x', { method: 'POST' })).rejects.toThrow('Something went wrong.');
  });

  it('falls back to raw text when the error body is not JSON', async () => {
    respond(502, 'Bad gateway');
    await expect(apiFetch('/x')).rejects.toThrow('Bad gateway');
  });

  it('falls back to the status text on an empty error body', async () => {
    respond(500, '');
    await expect(apiFetch('/x')).rejects.toThrow('Status');
  });
});

describe('configureApiClient', () => {
  const body = { fullName: 'A', dateOfBirth: '1', dateOfPassing: '2' };
  const urlCalled = () => fetchMock.mock.calls[0][0] as string;

  afterEach(() => {
    configureApiClient({});
    vi.unstubAllEnvs();
  });

  it('uses the configured URL', async () => {
    respond(200, {});
    configureApiClient({ baseUrl: 'https://api.example.test' });
    await generateObituary(body);
    expect(urlCalled()).toBe('https://api.example.test/obituary');
  });

  it('prefers the configured URL over EXPO_PUBLIC_API_URL', async () => {
    respond(200, {});
    vi.stubEnv('EXPO_PUBLIC_API_URL', 'https://expo.example.test');
    configureApiClient({ baseUrl: 'https://api.example.test' });
    await generateObituary(body);
    expect(urlCalled()).toBe('https://api.example.test/obituary');
  });

  it('falls back to EXPO_PUBLIC_API_URL when nothing is configured', async () => {
    respond(200, {});
    vi.stubEnv('EXPO_PUBLIC_API_URL', 'https://expo.example.test');
    configureApiClient({ baseUrl: undefined });
    await generateObituary(body);
    expect(urlCalled()).toBe('https://expo.example.test/obituary');
  });

  it('falls back to localhost when nothing is set, and ignores an empty value', async () => {
    respond(200, {});
    configureApiClient({ baseUrl: '  ' });
    await generateObituary(body);
    expect(urlCalled()).toBe('http://localhost:3001/obituary');
  });
});

describe('apiFetchNoContent', () => {
  it('resolves on 204', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await expect(apiFetchNoContent('/x', { method: 'DELETE' })).resolves.toBeUndefined();
  });

  it('resolves on a 2xx with an empty body', async () => {
    respond(200, '');
    await expect(apiFetchNoContent('/x')).resolves.toBeUndefined();
  });

  it('throws on a 2xx with any other body', async () => {
    respond(200, '<html>');
    await expect(apiFetchNoContent('/x')).rejects.toBeInstanceOf(ApiError);
  });

  it('throws ApiError with the status on non-2xx', async () => {
    respond(403, { error: 'no' });
    await expect(apiFetchNoContent('/x')).rejects.toMatchObject({ status: 403 });
  });
});
