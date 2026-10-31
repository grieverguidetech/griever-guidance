import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const original = process.env.EXPO_PUBLIC_FEATURE_PAYMENTS;

function paymentsEnabled(value: string | undefined): boolean {
  if (value === undefined) delete process.env.EXPO_PUBLIC_FEATURE_PAYMENTS;
  else process.env.EXPO_PUBLIC_FEATURE_PAYMENTS = value;
  let result = false;
  jest.isolateModules(() => {
    result = (require('./features') as typeof import('./features')).PAYMENTS_ENABLED;
  });
  return result;
}

afterEach(() => {
  if (original === undefined) delete process.env.EXPO_PUBLIC_FEATURE_PAYMENTS;
  else process.env.EXPO_PUBLIC_FEATURE_PAYMENTS = original;
});

describe('PAYMENTS_ENABLED', () => {
  it('is off when the variable is missing', () => {
    expect(paymentsEnabled(undefined)).toBe(false);
  });

  it('is on only for exactly "true"', () => {
    expect(paymentsEnabled('true')).toBe(true);
  });

  it.each(['false', '', 'TRUE', 'True', '1', ' true'])('is off for %j', (value) => {
    expect(paymentsEnabled(value)).toBe(false);
  });

  // Expo inlines EXPO_PUBLIC_* only for dot access, so bracket access would ship the flag stuck off.
  it('reads the variable with dot access, so Expo inlines it in the bundle', () => {
    const source = readFileSync(join(__dirname, 'features.ts'), 'utf8');
    expect(source).toMatch(/process\.env\.EXPO_PUBLIC_FEATURE_PAYMENTS\b/);
    expect(source).not.toMatch(/process\.env\[/);
  });
});

describe('SYNC_ENABLED', () => {
  const originalSync = process.env.EXPO_PUBLIC_FEATURE_SYNC;
  afterEach(() => {
    if (originalSync === undefined) delete process.env.EXPO_PUBLIC_FEATURE_SYNC;
    else process.env.EXPO_PUBLIC_FEATURE_SYNC = originalSync;
  });
  function syncEnabled(value: string | undefined): boolean {
    if (value === undefined) delete process.env.EXPO_PUBLIC_FEATURE_SYNC;
    else process.env.EXPO_PUBLIC_FEATURE_SYNC = value;
    let result = true;
    jest.isolateModules(() => {
      result = (require('./features') as typeof import('./features')).SYNC_ENABLED;
    });
    return result;
  }

  it('is off when the variable is missing', () => {
    expect(syncEnabled(undefined)).toBe(false);
  });

  it('is on only for exactly "true"', () => {
    expect(syncEnabled('true')).toBe(true);
    expect(syncEnabled('TRUE')).toBe(false);
    expect(syncEnabled('1')).toBe(false);
  });

  it('reads the variable with dot access, so Expo inlines it in the bundle', () => {
    const source = readFileSync(join(__dirname, 'features.ts'), 'utf8');
    expect(source).toMatch(/process\.env\.EXPO_PUBLIC_FEATURE_SYNC\b/);
  });
});
