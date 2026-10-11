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
