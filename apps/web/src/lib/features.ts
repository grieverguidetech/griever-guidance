/**
 * Build-time feature flags, read from Vite env vars. Anything not explicitly
 * set to "true" is off, so a missing variable can never switch a feature on.
 */

/**
 * Sign-up/sign-in (Facebook, Instagram, email/password). Off until the app has
 * users: with it off, nobody is asked for an account, onboarding starts at
 * adding contacts, and nothing calls the gateway's /auth routes.
 */
export const AUTH_ENABLED = import.meta.env['VITE_FEATURE_AUTH'] === 'true';

/**
 * AI-drafted obituaries (gateway-messages' obituary route). Off while in beta:
 * the "Write the obituary" button stays visible but disabled, with an
 * "in beta" tooltip, and nothing calls the gateway.
 */
export const OBITUARY_DRAFTING_ENABLED = import.meta.env['VITE_FEATURE_OBITUARY_DRAFTING'] === 'true';
