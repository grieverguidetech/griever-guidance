// Dot access on purpose: Expo only inlines `process.env.EXPO_PUBLIC_*` when it is written this way.
export const AUTH_ENABLED = process.env.EXPO_PUBLIC_FEATURE_AUTH === 'true';

/**
 * Paying for tasks after the first announcement. Off until the paywall is built:
 * with it off, every task stays free and nothing asks for payment.
 */
// Dot access on purpose: Expo only inlines `process.env.EXPO_PUBLIC_*` when it is written this way.
export const PAYMENTS_ENABLED = process.env.EXPO_PUBLIC_FEATURE_PAYMENTS === 'true';
