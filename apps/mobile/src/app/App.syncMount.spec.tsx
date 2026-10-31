import { describe, expect, it, jest } from '@jest/globals';
import { render, screen } from '@testing-library/react-native';

const mockUseMobileFlowSync = jest.fn((_options: unknown) => undefined);
jest.mock('../lib/useMobileFlowSync', () => ({ useMobileFlowSync: (options: unknown) => mockUseMobileFlowSync(options) }));

const { App } = require('./App') as typeof import('./App');

describe('App and background sync', () => {
  it('mounts the sync hook with the people on this device and the device cache', async () => {
    render(<App />);
    await screen.findByText("Who you're writing about");
    const options = mockUseMobileFlowSync.mock.calls[mockUseMobileFlowSync.mock.calls.length - 1][0] as {
      sessions: unknown[];
      applyRemoteFlows: unknown;
      storage: { getItem: unknown };
    };
    expect(Array.isArray(options.sessions)).toBe(true);
    expect(typeof options.applyRemoteFlows).toBe('function');
    expect(typeof options.storage.getItem).toBe('function');
  });
});
