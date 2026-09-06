import type { OAuthProvider } from './oauthProvider.js';

/**
 * Facebook Login. `public_profile` + `email` need no Meta app review
 * (verified 2026) — this is the plain "sign in with Facebook" surface, not
 * anything that touches friends or messaging (see CLAUDE.md's identity
 * section for why those are out of reach regardless). Facebook only ever
 * returns a *confirmed* address via this field, so its presence is treated
 * as verified.
 */
export function createFacebookProvider(appId: string, appSecret: string): OAuthProvider {
  return {
    id: 'facebook',
    authorizationUrl({ state, redirectUri }) {
      const url = new URL('https://www.facebook.com/v21.0/dialog/oauth');
      url.searchParams.set('client_id', appId);
      url.searchParams.set('redirect_uri', redirectUri);
      url.searchParams.set('state', state);
      url.searchParams.set('scope', 'public_profile,email');
      url.searchParams.set('response_type', 'code');
      return url.toString();
    },
    async exchangeCode({ code, redirectUri }) {
      const url = new URL('https://graph.facebook.com/v21.0/oauth/access_token');
      url.searchParams.set('client_id', appId);
      url.searchParams.set('client_secret', appSecret);
      url.searchParams.set('redirect_uri', redirectUri);
      url.searchParams.set('code', code);
      const response = await fetch(url.toString());
      if (!response.ok) throw new Error('Facebook rejected the sign-in code.');
      const data = (await response.json()) as { access_token: string };
      return { accessToken: data.access_token };
    },
    async fetchProfile({ accessToken }) {
      const url = new URL('https://graph.facebook.com/me');
      url.searchParams.set('fields', 'id,name,email');
      url.searchParams.set('access_token', accessToken);
      const response = await fetch(url.toString());
      if (!response.ok) throw new Error('Could not read the Facebook profile.');
      const data = (await response.json()) as { id: string; name?: string; email?: string };
      return {
        providerSub: data.id,
        email: data.email ?? null,
        emailVerified: Boolean(data.email),
        name: data.name ?? null,
      };
    },
  };
}
