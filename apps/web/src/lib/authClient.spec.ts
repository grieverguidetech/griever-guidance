import { hasStoredSession } from './authClient';

const SESSION = JSON.stringify({ access_token: 'a', refresh_token: 'r' });

afterEach(() => {
  vi.unstubAllEnvs();
  window.localStorage.clear();
});

describe('hasStoredSession', () => {
  it('finds the session under the key supabase-js uses for the project URL', () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://abcdef.supabase.co');
    window.localStorage.setItem('sb-abcdef-auth-token', SESSION);
    expect(hasStoredSession()).toBe(true);
  });

  it('ignores another project\'s session when the project URL is known', () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://abcdef.supabase.co');
    window.localStorage.setItem('sb-other-auth-token', SESSION);
    expect(hasStoredSession()).toBe(false);
  });

  it('with no URL, accepts any saved supabase session', () => {
    vi.stubEnv('VITE_SUPABASE_URL', '');
    window.localStorage.setItem('sb-abcdef-auth-token', SESSION);
    expect(hasStoredSession()).toBe(true);
  });

  it('is false for nothing stored, junk, or the code-verifier entry', () => {
    vi.stubEnv('VITE_SUPABASE_URL', '');
    expect(hasStoredSession()).toBe(false);
    window.localStorage.setItem('sb-abcdef-auth-token', '{oops');
    window.localStorage.setItem('sb-abcdef-auth-token-code-verifier', SESSION);
    expect(hasStoredSession()).toBe(false);
  });
});
