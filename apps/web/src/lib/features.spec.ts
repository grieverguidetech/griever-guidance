import { afterEach, describe, expect, it, vi } from 'vitest';

async function paymentsEnabled(): Promise<boolean> {
  vi.resetModules();
  return (await import('./features')).PAYMENTS_ENABLED;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('PAYMENTS_ENABLED', () => {
  it('is off when the variable is missing', async () => {
    vi.stubEnv('VITE_FEATURE_PAYMENTS', undefined);
    expect(await paymentsEnabled()).toBe(false);
  });

  it('is on only for exactly "true"', async () => {
    vi.stubEnv('VITE_FEATURE_PAYMENTS', 'true');
    expect(await paymentsEnabled()).toBe(true);
  });

  it.each(['false', '', 'TRUE', 'True', '1', ' true'])('is off for %j', async (value) => {
    vi.stubEnv('VITE_FEATURE_PAYMENTS', value);
    expect(await paymentsEnabled()).toBe(false);
  });
});
