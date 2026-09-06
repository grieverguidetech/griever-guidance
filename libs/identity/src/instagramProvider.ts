import type { OAuthProvider } from './oauthProvider.js';

/**
 * Instagram's own OAuth ("Business Login for Instagram") — a separate
 * app/credential pair from Meta's dashboard, not Facebook Login. Verified
 * 2026: only Business/Creator accounts can sign in at all (personal
 * accounts have had no login API since Basic Display's Dec-2024 shutdown),
 * and the profile Instagram returns never includes an email address —
 * `email` is always null from this provider by platform limitation, not a
 * bug. Any sign-up UI using this provider should say so up front rather
 * than let someone hit a wall mid-flow.
 */
export function createInstagramProvider(appId: string, appSecret: string): OAuthProvider {
  return {
    id: 'instagram',
    authorizationUrl({ state, redirectUri }) {
      const url = new URL('https://www.instagram.com/oauth/authorize');
      url.searchParams.set('client_id', appId);
      url.searchParams.set('redirect_uri', redirectUri);
      url.searchParams.set('state', state);
      url.searchParams.set('scope', 'instagram_business_basic');
      url.searchParams.set('response_type', 'code');
      return url.toString();
    },
    async exchangeCode({ code, redirectUri }) {
      const response = await fetch('https://api.instagram.com/oauth/access_token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: appId,
          client_secret: appSecret,
          grant_type: 'authorization_code',
          redirect_uri: redirectUri,
          code,
        }),
      });
      if (!response.ok) throw new Error('Instagram rejected the sign-in code.');
      const data = (await response.json()) as { access_token: string; user_id: string };
      return { accessToken: data.access_token, extra: { userId: String(data.user_id) } };
    },
    async fetchProfile({ accessToken, extra }) {
      const userId = extra?.['userId'];
      if (!userId) throw new Error('Missing Instagram user id from token exchange.');
      const url = new URL(`https://graph.instagram.com/v21.0/${userId}`);
      url.searchParams.set('fields', 'id,username');
      url.searchParams.set('access_token', accessToken);
      const response = await fetch(url.toString());
      if (!response.ok) throw new Error('Could not read the Instagram profile.');
      const data = (await response.json()) as { id: string; username?: string };
      return {
        providerSub: data.id,
        email: null,
        emailVerified: false,
        name: data.username ?? null,
      };
    },
  };
}
