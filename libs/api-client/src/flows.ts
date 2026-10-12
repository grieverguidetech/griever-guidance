import {
  isUuid,
  parseFlowRecord,
  pickFlowFacts,
  type FlowFacts,
  type FlowRecord,
} from '@griever/shared';
import { ApiError, apiFetch } from './client.js';

/**
 * Expected failures are values, never exceptions.
 * - `offline`: the request never reached a server. Sync retries later (C5).
 * - `signed_out` 401, `forbidden` 403, `not_found` 404, `invalid` 400/422 (or a bad id, never sent).
 * - `unavailable`: a 5xx. `failed`: anything else, including a reply that is not a valid record.
 */
export type FlowsFailureReason =
  | 'offline'
  | 'signed_out'
  | 'forbidden'
  | 'not_found'
  | 'invalid'
  | 'unavailable'
  | 'failed';

export type FlowsFailure = { ok: false; reason: FlowsFailureReason };
export type ListFlowsResult = { ok: true; flows: FlowRecord[] } | FlowsFailure;
export type WriteFlowResult = { ok: true; flow: FlowRecord } | FlowsFailure;

function reasonForStatus(status: number): FlowsFailureReason {
  if (status === 401) return 'signed_out';
  if (status === 403) return 'forbidden';
  if (status === 404) return 'not_found';
  if (status === 400 || status === 422) return 'invalid';
  if (status >= 500) return 'unavailable';
  return 'failed';
}

function failure(error: unknown): FlowsFailure {
  // Only the status is kept; the message could echo request text.
  if (error instanceof ApiError)
    return { ok: false, reason: reasonForStatus(error.status) };
  return {
    ok: false,
    reason: error instanceof TypeError ? 'offline' : 'failed',
  };
}

async function call(
  accessToken: string,
  path: string,
  init: RequestInit,
): Promise<{ ok: true; body: unknown } | FlowsFailure> {
  try {
    const body = await apiFetch<unknown>(path, {
      ...init,
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    return { ok: true, body };
  } catch (error) {
    return failure(error);
  }
}

/** Every person the signed-in user owns or helps with. Records that fail validation are dropped. */
export async function listFlows(accessToken: string): Promise<ListFlowsResult> {
  const result = await call(accessToken, '/flows', { method: 'GET' });
  if (!result.ok) return result;
  if (!Array.isArray(result.body)) return { ok: false, reason: 'failed' };
  const flows = result.body
    .map(parseFlowRecord)
    .filter((flow): flow is FlowRecord => flow !== null);
  return { ok: true, flows };
}

async function send(
  accessToken: string,
  path: string,
  method: 'POST' | 'PATCH',
  body: unknown,
): Promise<WriteFlowResult> {
  const result = await call(accessToken, path, {
    method,
    body: JSON.stringify(body),
  });
  if (!result.ok) return result;
  const flow = parseFlowRecord(result.body);
  return flow ? { ok: true, flow } : { ok: false, reason: 'failed' };
}

/**
 * Creates a person (owners only; a member gets `forbidden`). The id is made on the device. This is
 * a plain POST, never an upsert: a repeat for an existing id is a conflict, reported as `failed`.
 * The body is rebuilt from the whitelist even if the caller passed a whole session (C2/C3).
 */
export function createFlow(
  accessToken: string,
  id: string,
  facts: FlowFacts,
): Promise<WriteFlowResult> {
  if (!isUuid(id)) return Promise.resolve({ ok: false, reason: 'invalid' });
  return send(accessToken, '/flows', 'POST', { id, ...pickFlowFacts(facts) });
}

/** Edits a person. Sends only the changed whitelisted fields. */
export function patchFlow(
  accessToken: string,
  id: string,
  partial: Partial<FlowFacts>,
): Promise<WriteFlowResult> {
  if (!isUuid(id)) return Promise.resolve({ ok: false, reason: 'invalid' });
  return send(
    accessToken,
    `/flows/${encodeURIComponent(id)}`,
    'PATCH',
    pickFlowFacts(partial),
  );
}
