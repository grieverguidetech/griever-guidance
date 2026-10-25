import { describe, expect, it } from 'vitest';
import { identityErrorMessage } from './accountCache';

describe('identityErrorMessage', () => {
  it('returns calm copy for a known reason', () => {
    expect(identityErrorMessage('offline')).toBe("You need a connection to do this. Nothing you've typed is lost.");
  });

  it('reads an unknown reason as unavailable', () => {
    expect(identityErrorMessage('nope')).toBe(identityErrorMessage('unavailable'));
  });

  it('does not treat inherited object keys as reasons', () => {
    expect(identityErrorMessage('toString')).toBe(identityErrorMessage('unavailable'));
  });
});
