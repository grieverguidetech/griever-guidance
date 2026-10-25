export type AccountAuthStatus = 'loading' | 'signed_in' | 'signed_out';

/**
 * `offline`: the sign-in provider could not reach its server. The person is still signed in (C5).
 * `signed_out`: there is no session to get a token from.
 */
export type AccountTokenResult =
  | { ok: true; token: string }
  | { ok: false; reason: 'signed_out' | 'offline' };

/**
 * The only seam between the app's sign-in provider and the shared libs. Each app writes a small
 * adapter that fills this in; libs never import the provider itself.
 */
export interface AccountAuth {
  status: AccountAuthStatus;
  /** null unless `status` is `signed_in`. */
  userId: string | null;
  /** `forceRefresh` asks for a new token instead of a cached one; used once after a 401. */
  getToken(options?: { forceRefresh?: boolean }): Promise<AccountTokenResult>;
  signOut(): Promise<void>;
}
