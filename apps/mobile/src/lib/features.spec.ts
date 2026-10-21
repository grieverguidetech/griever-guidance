import { afterEach, describe, expect, it, jest } from '@jest/globals';

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
});
