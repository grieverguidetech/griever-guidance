/**
 * Accounts. On only when the flag is exactly "true" AND a Clerk publishable key is set. A build
 * that has the flag but no key (the EAS env var is missing) keeps accounts off and works on this
 * phone only, instead of showing account screens that cannot load.
 */
// Dot access on purpose: Expo only inlines `process.env.EXPO_PUBLIC_*` when it is written this way.
export const AUTH_ENABLED =
  process.env.EXPO_PUBLIC_FEATURE_AUTH === 'true' && (process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY ?? '') !== '';

/**
 * Background sync of the person's details to the account. Off unless exactly "true", and only
 * runs when signed in (so it also needs EXPO_PUBLIC_FEATURE_AUTH).
 */
// Dot access on purpose: Expo only inlines `process.env.EXPO_PUBLIC_*` when it is written this way.
export const SYNC_ENABLED = process.env.EXPO_PUBLIC_FEATURE_SYNC === 'true';

/**
 * Paying for tasks after the first announcement. Off until the paywall is built:
 * with it off, every task stays free and nothing asks for payment.
 */
// Dot access on purpose: Expo only inlines `process.env.EXPO_PUBLIC_*` when it is written this way.
export const PAYMENTS_ENABLED = process.env.EXPO_PUBLIC_FEATURE_PAYMENTS === 'true';

/**
 * "People helping you" on Your account (list, invite by typed email, cancel an invitation). Off until web /join exists (#128), because an
 * invitation link opens it. Off unless exactly "true"; it shows only when also signed in.
 */
// Dot access on purpose: Expo only inlines `process.env.EXPO_PUBLIC_*` when it is written this way.
export const SHARING_ENABLED = process.env.EXPO_PUBLIC_FEATURE_SHARING === 'true';
