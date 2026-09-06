import { createFacebookProvider } from './facebookProvider.js';
import { createInstagramProvider } from './instagramProvider.js';
import { getConvexClient } from './convexClient.js';
import { createIdentityRouter } from './router.js';
import type { OAuthProvider } from './oauthProvider.js';

export { createIdentityRouter } from './router.js';
export type { IdentityRouterConfig, ConvexLike } from './router.js';
export type { OAuthProvider, OAuthProfile, OAuthExchangeResult } from './oauthProvider.js';
export { createFacebookProvider } from './facebookProvider.js';
export { createInstagramProvider } from './instagramProvider.js';
export { signToken, verifyToken } from './token.js';

function buildProviders(): Record<string, OAuthProvider> {
  const providers: Record<string, OAuthProvider> = {};

  const facebookId = process.env['FACEBOOK_APP_ID'];
  const facebookSecret = process.env['FACEBOOK_APP_SECRET'];
  if (facebookId && facebookSecret) providers['facebook'] = createFacebookProvider(facebookId, facebookSecret);

  // Registered only once real Instagram Business/Creator app credentials
  // exist — until then `/auth/instagram/start` returns 404 rather than the
  // gateway crashing at boot for a provider nobody's configured yet.
  const instagramId = process.env['INSTAGRAM_APP_ID'];
  const instagramSecret = process.env['INSTAGRAM_APP_SECRET'];
  if (instagramId && instagramSecret) {
    providers['instagram'] = createInstagramProvider(instagramId, instagramSecret);
  }

  return providers;
}

const allowedRedirectOrigins = (process.env['CORS_ORIGINS'] ?? '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

/**
 * The router apps/gateway actually mounts, built from environment
 * variables — see apps/gateway/.env.example for the full list.
 */
export const identityRouter = createIdentityRouter({
  providers: buildProviders(),
  getConvexClient,
  sessionSecret: process.env['IDENTITY_SESSION_SECRET'],
  serviceSecret: process.env['IDENTITY_SERVICE_SECRET'],
  gatewayBaseUrl: process.env['GATEWAY_BASE_URL'],
  allowedRedirectOrigins,
});
