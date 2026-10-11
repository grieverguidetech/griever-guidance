import { describe, expect, it } from '@jest/globals';
import { createMobileAuthClient } from './authClient';

describe('createMobileAuthClient', () => {
  it('returns null when the url or key is missing', () => {
    expect(createMobileAuthClient({ url: undefined, anonKey: 'k' })).toBeNull();
    expect(createMobileAuthClient({ url: 'https://x.supabase.co', anonKey: '' })).toBeNull();
  });

  it('returns null instead of throwing on a malformed url', () => {
    expect(createMobileAuthClient({ url: 'not a url', anonKey: 'k' })).toBeNull();
  });

  it('returns a client when both are set (no network at creation)', () => {
    const client = createMobileAuthClient({ url: 'https://example.supabase.co', anonKey: 'anon-key' });
    expect(typeof client?.signIn).toBe('function');
  });
});
