/** What a successful sign-in tells us about the person, normalized across providers. */
export interface OAuthProfile {
  providerSub: string;
  email: string | null;
  emailVerified: boolean;
  name: string | null;
}

/** The result of exchanging an authorization code — `extra` carries whatever a
 * provider's profile fetch needs beyond the access token (Instagram's user id). */
export interface OAuthExchangeResult {
  accessToken: string;
  extra?: Record<string, string>;
}

export interface OAuthProvider {
  id: 'facebook' | 'instagram';
  authorizationUrl(params: { state: string; redirectUri: string }): string;
  exchangeCode(params: { code: string; redirectUri: string }): Promise<OAuthExchangeResult>;
  fetchProfile(params: { accessToken: string; extra?: Record<string, string> }): Promise<OAuthProfile>;
}
