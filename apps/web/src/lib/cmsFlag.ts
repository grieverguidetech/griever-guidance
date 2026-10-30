/**
 * The web editor flag, on its own module so specs can mock it without touching the other flags.
 * Re-exported from features.ts.
 */
export const CMS_ENABLED = import.meta.env['VITE_FEATURE_CMS'] === 'true';
