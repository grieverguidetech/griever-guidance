import { createClerkWebhookRouter } from './clerkWebhook.js';
import { createProfileRouter } from './profileRouter.js';

export { createProfileRouter, parseProfileBody } from './profileRouter.js';
export type { ProfileRouterConfig } from './profileRouter.js';

/**
 * GET/PUT /me/profile through the data function, as the signed-in Clerk caller. Env is read per request; unset
 * means these routes answer 503 rather than the gateway failing to start.
 */
export const profileRouter = createProfileRouter({
  getAuthConfig: () => {
    const issuer = process.env['CLERK_ISSUER']?.trim();
    if (!issuer) return null;
    const authorizedParties = (process.env['CLERK_AUTHORIZED_PARTIES'] ?? '')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean);
    return { issuer, authorizedParties };
  },
  getDataConfig: () => {
    const url = process.env['DATA_FUNCTION_URL']?.trim();
    if (!url) return null;
    return {
      url,
      region: process.env['DATA_FUNCTION_REGION']?.trim(),
      accessKeyId: process.env['DATA_FUNCTION_ACCESS_KEY_ID'],
      secretAccessKey: process.env['DATA_FUNCTION_SECRET_ACCESS_KEY'],
    };
  },
});

export { createClerkWebhookRouter, verifySvix } from './clerkWebhook.js';
export type { ClerkWebhookConfig } from './clerkWebhook.js';

/** POST /webhooks/clerk: a Clerk user.deleted event deletes that user's data (#327). Env is read per request. */
export const clerkWebhookRouter = createClerkWebhookRouter({
  getWebhookSecret: () => process.env['CLERK_WEBHOOK_SECRET']?.trim() || null,
  getServiceSecret: () =>
    process.env['DATA_FUNCTION_SERVICE_SECRET']?.trim() || null,
  getDataConfig: () => {
    const url = process.env['DATA_FUNCTION_URL']?.trim();
    if (!url) {
      return null;
    }
    return {
      url,
      region: process.env['DATA_FUNCTION_REGION']?.trim(),
      accessKeyId: process.env['DATA_FUNCTION_ACCESS_KEY_ID'],
      secretAccessKey: process.env['DATA_FUNCTION_SECRET_ACCESS_KEY'],
    };
  },
});
