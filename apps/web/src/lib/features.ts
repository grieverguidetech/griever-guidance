/**
 * Build-time feature flags, read from Vite env vars. Anything not explicitly
 * set to "true" is off, so a missing variable can never switch a feature on.
 */

/**
 * Accounts (sign-up and sign-in through Clerk). Off until the app has
 * users: with it off, nobody is asked for an account, onboarding starts at
 * adding contacts, and Clerk is never loaded.
 */
export const AUTH_ENABLED = import.meta.env['VITE_FEATURE_AUTH'] === 'true';

/**
 * AI-drafted obituaries (gateway-messages' obituary route). Off while in beta:
 * the "Write the obituary" button stays visible but disabled, with an
 * "in beta" tooltip, and nothing calls the gateway.
 */
export const OBITUARY_DRAFTING_ENABLED = import.meta.env['VITE_FEATURE_OBITUARY_DRAFTING'] === 'true';

/**
 * Family sharing (inviting people to help, joining, removing). Off until people's
 * data actually syncs between phones, so a member who joins never sees an empty Home.
 */
export const SHARING_ENABLED = import.meta.env['VITE_FEATURE_SHARING'] === 'true';

/**
 * Paying for tasks after the first announcement. Off until the paywall is built:
 * with it off, every task stays free and nothing asks for payment.
 */
export const PAYMENTS_ENABLED = import.meta.env['VITE_FEATURE_PAYMENTS'] === 'true';
