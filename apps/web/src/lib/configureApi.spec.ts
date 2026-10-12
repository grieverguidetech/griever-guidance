import { generateObituary } from '@griever/api-client';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('configureApi', () => {
  it('points the api client at VITE_API_URL', async () => {
    vi.stubEnv('VITE_API_URL', 'https://api.example.test');
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ draft: 'x' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await import('./configureApi');
    await generateObituary({ fullName: 'A', dateOfBirth: '1', dateOfPassing: '2' });

    expect(fetchMock.mock.calls[0][0]).toBe('https://api.example.test/obituary');
  });
});

describe('API_URL', () => {
  it('exports VITE_API_URL', async () => {
    vi.stubEnv('VITE_API_URL', 'https://api.example.test');
    const { API_URL } = await import('./configureApi');
    expect(API_URL).toBe('https://api.example.test');
  });

  it('falls back to the local gateway when unset', async () => {
    vi.stubEnv('VITE_API_URL', '');
    const { API_URL } = await import('./configureApi');
    expect(API_URL).toBe('http://localhost:3001');
  });
});
