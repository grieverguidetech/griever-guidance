import { metaStore } from '@griever/data-local';
import { createGatewayTransport } from '@griever/data-sync';

vi.mock('@griever/data-local', () => ({ metaStore: { setMetaString: vi.fn().mockResolvedValue(undefined) } }));
vi.mock('@griever/data-sync', () => ({
  getOrCreateDeviceId: vi.fn().mockResolvedValue('device-1'),
  createGatewayTransport: vi.fn().mockReturnValue({}),
  registerSyncTriggers: vi.fn().mockReturnValue({ stop: vi.fn() }),
  BACKGROUND_SYNC_TAG: 'gg-sync',
}));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
  vi.resetModules();
});

describe('registerSync', () => {
  it('stores the shared API URL for the Service Worker', async () => {
    vi.stubEnv('VITE_API_URL', 'https://api.example.test');
    const { registerSync } = await import('./registerSync');
    await registerSync();
    expect(metaStore.setMetaString).toHaveBeenCalledWith('gatewayUrl', 'https://api.example.test');
  });

  it('gives the gateway transport the same URL', async () => {
    vi.stubEnv('VITE_API_URL', 'https://api.example.test');
    const { setSyncUserId } = await import('./registerSync');
    await setSyncUserId('user-1');
    expect(createGatewayTransport).toHaveBeenCalledWith({
      baseUrl: 'https://api.example.test',
      devUserId: 'user-1',
    });
  });
});
