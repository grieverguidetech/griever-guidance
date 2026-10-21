/**
 * Reasons a data action can fail. The gateway maps them to HTTP later:
 * `busy` is 503 with a calm "please try again" (decision on #268), never 404.
 */
export type DataErrorCode =
  | 'not_found'
  | 'forbidden'
  | 'conflict'
  | 'already_invited'
  | 'invite_conflict'
  | 'busy';

export const BUSY_MESSAGE = 'Something is busy right now. Please try again in a moment.';

export const HTTP_STATUS: Record<DataErrorCode, number> = {
  not_found: 404,
  forbidden: 403,
  conflict: 409,
  already_invited: 409,
  invite_conflict: 409,
  busy: 503,
};
