import type {
  AcceptInviteRequest,
  AcceptInviteResponse,
  CreateInviteRequest,
  MembersView,
  PendingInvite,
} from '@griever/shared';
import { ApiError, apiFetch, apiFetchNoContent } from './client.js';

/**
 * Expected failures are values, never exceptions.
 * - `offline`: the request never reached a server (C5: account actions need a connection).
 * - `signed_out` 401, `invalid` 400, `forbidden` 403, `rate_limited` 429.
 * - `conflict` 409: creating, already invited or already a member; accepting, the joiner owns people.
 * - `unusable`: accepting only. The invite link is wrong, expired, used or revoked. The gateway gives
 *   one answer (404 or 410) for all of these, so nothing is revealed. Elsewhere a 404 is `failed`.
 * - `unavailable`: a 5xx.
 */
export type MembersFailureReason =
  | 'offline'
  | 'signed_out'
  | 'invalid'
  | 'forbidden'
  | 'conflict'
  | 'rate_limited'
  | 'unusable'
  | 'unavailable'
  | 'failed';

export type MembersFailure = { ok: false; reason: MembersFailureReason };

export type GetMembersResult = { ok: true; view: MembersView } | MembersFailure;
export type CreateInviteResult =
  | { ok: true; invite: PendingInvite }
  | MembersFailure;
export type RevokeInviteResult = { ok: true } | MembersFailure;
export type RemoveMemberResult = { ok: true } | MembersFailure;
export type AcceptInviteResult =
  | { ok: true; ownerId: string }
  | MembersFailure;

function reasonForStatus(
  status: number,
  isAccept = false,
): MembersFailureReason {
  if (status === 401) return 'signed_out';
  if (status === 400) return 'invalid';
  if (status === 403) return 'forbidden';
  if (status === 429) return 'rate_limited';
  if (status === 409) return 'conflict';
  if (isAccept && (status === 404 || status === 410)) return 'unusable';
  if (status >= 500) return 'unavailable';
  return 'failed';
}

function failure(error: unknown, isAccept = false): MembersFailure {
  // Only the status is kept. The message could echo request text, and a token must not travel on.
  if (error instanceof ApiError)
    return { ok: false, reason: reasonForStatus(error.status, isAccept) };
  // A fetch TypeError is a network failure (a malformed header value also throws one and reads as
  // offline). A malformed body (SyntaxError) is `failed`.
  return { ok: false, reason: error instanceof TypeError ? 'offline' : 'failed' };
}

async function call<T>(
  accessToken: string,
  path: string,
  init: RequestInit,
  isAccept = false,
): Promise<{ ok: true; body: T } | MembersFailure> {
  try {
    const body = await apiFetch<T>(path, {
      ...init,
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    return { ok: true, body };
  } catch (error) {
    return failure(error, isAccept);
  }
}

/** Ids go in the path, so each is encoded; the gateway validates them as uuids (C8). */
const segment = (id: string) => encodeURIComponent(id);

async function callNoBody(
  accessToken: string,
  path: string,
  init: RequestInit,
): Promise<{ ok: true } | MembersFailure> {
  try {
    await apiFetchNoContent(path, {
      ...init,
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

export async function getMembers(accessToken: string): Promise<GetMembersResult> {
  const result = await call<MembersView>(accessToken, '/members', {
    method: 'GET',
  });
  return result.ok ? { ok: true, view: result.body } : result;
}

export async function createInvite(
  accessToken: string,
  email: string,
): Promise<CreateInviteResult> {
  const payload: CreateInviteRequest = { email };
  const result = await call<PendingInvite>(accessToken, '/invites', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return result.ok ? { ok: true, invite: result.body } : result;
}

export function revokeInvite(
  accessToken: string,
  inviteId: string,
): Promise<RevokeInviteResult> {
  return callNoBody(accessToken, `/invites/${segment(inviteId)}`, {
    method: 'DELETE',
  });
}

export function removeMember(
  accessToken: string,
  memberId: string,
): Promise<RemoveMemberResult> {
  return callNoBody(accessToken, `/members/${segment(memberId)}`, {
    method: 'DELETE',
  });
}

/** The invite token goes in the JSON body only, never in the URL. */
export async function acceptInvite(
  accessToken: string,
  inviteToken: string,
): Promise<AcceptInviteResult> {
  const payload: AcceptInviteRequest = { token: inviteToken };
  const result = await call<AcceptInviteResponse>(
    accessToken,
    '/invites/accept',
    { method: 'POST', body: JSON.stringify(payload) },
    true,
  );
  return result.ok ? { ok: true, ownerId: result.body.ownerId } : result;
}
