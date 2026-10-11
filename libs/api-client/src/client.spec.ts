import { apiFetch, generateObituary } from './client.js';

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
    respond(400, { error: 'That email is already in use.' });
    await expect(apiFetch('/x', { method: 'POST' })).rejects.toThrow('That email is already in use.');
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
