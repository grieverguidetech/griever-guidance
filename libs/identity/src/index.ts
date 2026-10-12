import { createProfileRouter } from './profileRouter.js';

export { createProfileRouter, parseProfileBody } from './profileRouter.js';
export type { ProfileRouterConfig } from './profileRouter.js';
export { createProfilesClient } from './supabaseClient.js';
export type { ProfileFields, ProfilesClient } from './supabaseClient.js';

/**
 * GET/PUT /me/profile against Supabase, as the signed-in caller (anon key plus
 * their JWT, so row-level security applies). Env is read per request; unset
 * means these routes answer 503 rather than the gateway failing to start.
 */
export const profileRouter = createProfileRouter({
  getConfig: () => {
    const url = process.env['SUPABASE_URL'];
    const anonKey = process.env['SUPABASE_ANON_KEY'];
    return url && anonKey ? { url: url.replace(/\/+$/, ''), anonKey } : null;
  },
});
