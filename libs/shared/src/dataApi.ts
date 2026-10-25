/**
 * The contract between the gateway and the data function. Both sides import
 * it, so a new action or error code changes one list.
 */

/** Header that carries the user's own token. It is never sent in `Authorization`. */
export const DATA_USER_TOKEN_HEADER = 'x-gg-user-token';

/** Every action the data function exposes. `deleteUserData` is deliberately absent: no route reaches it. */
export const DATA_ACTIONS = [
  'getProfile',
  'putProfile',
  'listFlows',
  'createFlow',
  'updateFlow',
  'createInvite',
  'revokeInvite',
  'listMembers',
  'removeMember',
  'acceptInvite',
] as const;

export type DataAction = (typeof DATA_ACTIONS)[number];

/** The JSON body of `POST /v1`. */
export interface DataRequest {
  action: DataAction;
  args: Record<string, unknown>;
}

/** Reasons a data action can fail. The first group matches `libs/data-access/src/errors.ts`. */
export const DATA_ERROR_CODES = [
  'not_found',
  'forbidden',
  'conflict',
  'already_invited',
  'invite_conflict',
  'busy',
  'invalid',
  'rate_limited',
  'already_member',
  'unauthorized',
] as const;

export type DataErrorCode = (typeof DATA_ERROR_CODES)[number];

/** A domain outcome. Failures are values, not exceptions. */
export type DataResult<T = unknown> =
  | { ok: true; data: T }
  /** `message` is internal to the data function: routes map it to calm copy (C7), never forward it to users. */
  | { ok: false; code: DataErrorCode; message?: string };

export function isDataErrorCode(value: unknown): value is DataErrorCode {
  return typeof value === 'string' && (DATA_ERROR_CODES as readonly string[]).includes(value);
}
