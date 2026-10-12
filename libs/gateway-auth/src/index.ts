export { supabaseAuth, clearJwksCache } from './supabaseJwt.js';
export type { SupabaseConfig, SupabaseAuthVariables } from './supabaseJwt.js';
export { PostgrestError, postgrestHeaders, postgrestRequest, rpc } from './postgrest.js';
// Test helpers (ES256 keys and token signing) shared by the specs of libs that use this lib.
export { SUPABASE_URL, USER_ID, jsonResponse, makeKeys, signJwt } from './testSupabase.js';

export const GATEWAY_AUTH_LIB = '@griever/gateway-auth';
