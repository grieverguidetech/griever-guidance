import { afterEach, describe, expect, it, vi } from 'vitest';
import { unregisterOldWorker } from './unregisterOldWorker';

const reg = (url: string) => ({
  active: { scriptURL: url },
  unregister: vi.fn().mockResolvedValue(true),
});

afterEach(() => vi.unstubAllGlobals());

describe('unregisterOldWorker', () => {
  it('unregisters the /sw.js registration and leaves others alone', async () => {
    const old = reg('https://web.example.com/sw.js');
    const other = reg('https://web.example.com/other-worker.js');
    vi.stubGlobal('navigator', {
      serviceWorker: { getRegistrations: vi.fn().mockResolvedValue([old, other]) },
    });
    await unregisterOldWorker();
    expect(old.unregister).toHaveBeenCalledTimes(1);
    expect(other.unregister).not.toHaveBeenCalled();
  });

  it('does nothing when serviceWorker is absent', async () => {
    vi.stubGlobal('navigator', {});
    await expect(unregisterOldWorker()).resolves.toBeUndefined();
  });

  it('swallows errors', async () => {
    vi.stubGlobal('navigator', {
      serviceWorker: { getRegistrations: vi.fn().mockRejectedValue(new Error('x')) },
    });
    await expect(unregisterOldWorker()).resolves.toBeUndefined();
  });
});
