// Thin wrappers over #117's SQL functions, called as the signed-in user (their JWT, never a
// service-role key). Known PostgREST failures become typed results; anything else throws.
import { PostgrestError, rpc, type SupabaseConfig } from '@griever/gateway-auth';
import type { MembersView } from '@griever/shared';

export type MembersFailure = 'invalid' | 'forbidden' | 'not_found' | 'conflict' | 'rate_limited';
export type MembersResult<T> = { ok: true; value: T } | { ok: false; reason: MembersFailure };

const REASONS: Record<string, MembersFailure> = {
  PT400: 'invalid',
  PT403: 'forbidden',
  PT404: 'not_found',
  PT409: 'conflict',
  PT429: 'rate_limited',
};

async function call<T>(
  config: SupabaseConfig,
  jwt: string,
  name: string,
  args: Record<string, unknown>,
): Promise<MembersResult<T>> {
  try {
    return { ok: true, value: await rpc<T>(config, jwt, name, args) };
  } catch (err) {
    const reason = err instanceof PostgrestError && err.code ? REASONS[err.code] : undefined;
    if (reason) return { ok: false, reason };
    throw err;
  }
}

/** Returns the new invite's id. */
export const createInvite = (config: SupabaseConfig, jwt: string, email: string, tokenHash: string) =>
  call<string>(config, jwt, 'create_invite', { p_email: email, p_token_hash: tokenHash });

/** Returns the owner's id. Every failure is `not_found` (uniform by design) or `conflict`. */
export const acceptInvite = (config: SupabaseConfig, jwt: string, tokenHash: string) =>
  call<string>(config, jwt, 'accept_invite', { p_token_hash: tokenHash });

export const listMembers = (config: SupabaseConfig, jwt: string) =>
  call<MembersView>(config, jwt, 'list_members', {});

export const revokeInvite = async (config: SupabaseConfig, jwt: string, inviteId: string) =>
  call<null>(config, jwt, 'revoke_invite', { p_invite_id: inviteId });

export const removeMember = async (config: SupabaseConfig, jwt: string, memberId: string) =>
  call<null>(config, jwt, 'remove_member', { p_member_id: memberId });
