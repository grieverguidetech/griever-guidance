/**
 * The web background-sync flag, on its own module so specs can mock it without touching the other
 * flags. Re-exported from features.ts. Off by default: with it off nothing calls /flows.
 */
export const SYNC_ENABLED = import.meta.env['VITE_FEATURE_SYNC'] === 'true';
