// Dot access on purpose: Expo only inlines `process.env.EXPO_PUBLIC_*` when it is written this way.
export const AUTH_ENABLED = process.env.EXPO_PUBLIC_FEATURE_AUTH === 'true';
