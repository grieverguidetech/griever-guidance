import type {
  AcceptInviteRequest,
  AcceptInviteResponse,
  CreateInviteRequest,
  MembersView,
  PendingInvite,
} from '@griever/shared';
import { ApiError, apiFetch } from './client.js';

/**
 * Expected failures are values, never exceptions.
 * - `offline`: the request never reached a server (C5: account actions need a connection).
 * - `signed_out` 401, `invalid` 400, `forbidden` 403, `rate_limited` 429.
 * - `unusable`: the invite link is wrong, expired, used or revoked. The gateway gives one answer
 *   (404 or 410) for all of these, so nothing is revealed.
 * - `unavailable`: a 5xx.
 */
export type MembersFailureReason =
  | 'offline'
  | 'signed_out'
  | 'invalid'
  | 'forbidden'
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

function reasonForStatus(status: number): MembersFailureReason {
  if (status === 401) return 'signed_out';
  if (status === 400) return 'invalid';
  if (status === 403) return 'forbidden';
  if (status === 429) return 'rate_limited';
  if (status === 404 || status === 410) return 'unusable';
  if (status >= 500) return 'unavailable';
  return 'failed';
}

function failure(error: unknown): MembersFailure {
  // Only the status is kept. The message could echo request text, and a token must not travel on.
  if (error instanceof ApiError)
    return { ok: false, reason: reasonForStatus(error.status) };
  // Only a fetch TypeError is a network failure; a malformed body (SyntaxError) is `failed`.
  return { ok: false, reason: error instanceof TypeError ? 'offline' : 'failed' };
}

async function call<T>(
  accessToken: string,
  path: string,
  init: RequestInit,
): Promise<{ ok: true; body: T } | MembersFailure> {
  try {
    const body = await apiFetch<T>(path, {
      ...init,
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    return { ok: true, body };
  } catch (error) {
    return failure(error);
  }
}

/** Ids go in the path, so each is encoded; the gateway validates them as uuids (C8). */
const segment = (id: string) => encodeURIComponent(id);

/** For routes that may answer 2xx with no body: apiFetch then fails to parse JSON. Not an error. */
async function callNoBody(
  accessToken: string,
  path: string,
  init: RequestInit,
): Promise<{ ok: true } | MembersFailure> {
  try {
    await apiFetch<unknown>(path, {
      ...init,
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    return { ok: true };
  } catch (error) {
    // A non-2xx throws ApiError first, so a SyntaxError here means success with an empty body.
    if (error instanceof SyntaxError) return { ok: true };
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
  );
  return result.ok ? { ok: true, ownerId: result.body.ownerId } : result;
}
