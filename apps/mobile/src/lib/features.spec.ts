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

describe('AUTH_ENABLED', () => {
  const originalAuth = process.env.EXPO_PUBLIC_FEATURE_AUTH;
  const originalKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;
  afterEach(() => {
    if (originalAuth === undefined) {
      delete process.env.EXPO_PUBLIC_FEATURE_AUTH;
    } else {
      process.env.EXPO_PUBLIC_FEATURE_AUTH = originalAuth;
    }
    if (originalKey === undefined) {
      delete process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;
    } else {
      process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY = originalKey;
    }
  });
  function authEnabled(flag: string | undefined, key: string | undefined): boolean {
    if (flag === undefined) {
      delete process.env.EXPO_PUBLIC_FEATURE_AUTH;
    } else {
      process.env.EXPO_PUBLIC_FEATURE_AUTH = flag;
    }
    if (key === undefined) {
      delete process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;
    } else {
      process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY = key;
    }
    let result = true;
    jest.isolateModules(() => {
      result = (require('./features') as typeof import('./features')).AUTH_ENABLED;
    });
    return result;
  }

  it('is on when the flag is "true" and a Clerk key is set', () => {
    expect(authEnabled('true', 'pk_test_example')).toBe(true);
  });

  it('stays off when the flag is on but the Clerk key is missing or empty', () => {
    expect(authEnabled('true', undefined)).toBe(false);
    expect(authEnabled('true', '')).toBe(false);
  });

  it('stays off when the flag is not exactly "true", even with a key', () => {
    expect(authEnabled(undefined, 'pk_test_example')).toBe(false);
    expect(authEnabled('TRUE', 'pk_test_example')).toBe(false);
  });

  it('reads both variables with dot access, so Expo inlines them in the bundle', () => {
    const source = readFileSync(join(__dirname, 'features.ts'), 'utf8');
    expect(source).toMatch(/process\.env\.EXPO_PUBLIC_FEATURE_AUTH\b/);
    expect(source).toMatch(/process\.env\.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY\b/);
  });
});
