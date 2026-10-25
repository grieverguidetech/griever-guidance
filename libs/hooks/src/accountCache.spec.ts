import { describe, expect, it } from 'vitest';
import { identityErrorMessage } from './accountCache';

const REASONS = ['email_taken', 'invalid_credentials', 'rate_limited', 'offline', 'unavailable', 'weak_password', 'invalid_email'];

describe('identityErrorMessage', () => {
  it('returns calm copy for a known reason', () => {
    expect(identityErrorMessage('offline')).toBe("You need a connection to do this. Nothing you've typed is lost.");
  });

  it.each(REASONS)('%s has calm copy with no exclamation mark (C7)', (reason) => {
    const message = identityErrorMessage(reason);
    expect(message).not.toBe('');
    expect(message).not.toContain('!');
  });

  it('reads an unknown reason as unavailable', () => {
    expect(identityErrorMessage('nope')).toBe(identityErrorMessage('unavailable'));
  });

  it.each(['toString', 'constructor', '__proto__'])('does not treat the inherited key %s as a reason', (key) => {
    expect(identityErrorMessage(key)).toBe(identityErrorMessage('unavailable'));
  });
});
