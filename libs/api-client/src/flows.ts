import {
  FLOW_DETAIL_KEYS,
  isUuid,
  parseFlowDetails,
  parseFlowFacts,
  parseFlowPatch,
  parseFlowRecord,
  pickFlowFacts,
  splitSyncedPatch,
  type FlowDetails,
  type FlowFacts,
  type FlowRecord,
  type SyncedFields,
} from '@griever/shared';
import { ApiError, apiFetch } from './client.js';

/** Copies only the whitelisted detail keys that are present. Never a spread. */
export function pickFlowDetails(source: object): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of FLOW_DETAIL_KEYS) {
    const value = (source as Record<string, unknown>)[key];
    if (value !== undefined) {
      out[key] = value;
    }
  }
  return out;
}

/**
 * Validates a partial set of synced fields (facts and details together) and returns it flat, or
 * null when any key is unknown, forbidden or out of range (C8). Used for queued edits and bodies.
 */
export function parseSyncedPatch(input: unknown): Partial<SyncedFields> | null {
  const split = splitSyncedPatch(input);
  if (!split) {
    return null;
  }
  const facts = parseFlowPatch(split.facts);
  const details = parseFlowDetails(split.details);
  return facts && details ? { ...facts, ...details } : null;
}

/**
 * Expected failures are values, never exceptions.
 * - `offline`: the request never reached a server. Sync retries later (C5).
 * - `conflict` 409: on create, the id already exists, so switch to `patchFlow`.
 * - `signed_out` 401, `forbidden` 403, `not_found` 404, `invalid` 400/422 (or a bad id, never sent).
 * - `unavailable`: a 5xx. `failed`: anything else, including a reply that is not a valid record.
 */
export type FlowsFailureReason =
  | 'offline'
  | 'signed_out'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'invalid'
  | 'unavailable'
  | 'failed';

export type FlowsFailure = { ok: false; reason: FlowsFailureReason };
export type ListFlowsResult =
  | { ok: true; flows: FlowRecord[]; dropped: number }
  | FlowsFailure;
export type WriteFlowResult = { ok: true; flow: FlowRecord } | FlowsFailure;
/** `flow: null` means there was nothing to send. */
export type PatchFlowResult =
  | { ok: true; flow: FlowRecord | null }
  | FlowsFailure;

function reasonForStatus(status: number): FlowsFailureReason {
  if (status === 401) return 'signed_out';
  if (status === 403) return 'forbidden';
  if (status === 404) return 'not_found';
  if (status === 409) return 'conflict';
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
  signal?: AbortSignal,
): Promise<{ ok: true; body: unknown } | FlowsFailure> {
  try {
    const body = await apiFetch<unknown>(
      path,
      { ...init, headers: { Authorization: `Bearer ${accessToken}` } },
      signal,
    );
    return { ok: true, body };
  } catch (error) {
    return failure(error);
  }
}

/** Every person the signed-in user owns or helps with. Records that fail validation are dropped. */
export async function listFlows(
  accessToken: string,
  signal?: AbortSignal,
): Promise<ListFlowsResult> {
  const result = await call(accessToken, '/flows', { method: 'GET' }, signal);
  if (!result.ok) return result;
  if (!Array.isArray(result.body)) return { ok: false, reason: 'failed' };
  const flows = result.body
    .map(parseFlowRecord)
    .filter((flow): flow is FlowRecord => flow !== null);
  // `dropped` lets sync tell "the server stopped listing it" from "we couldn't read it".
  return { ok: true, flows, dropped: result.body.length - flows.length };
}

async function send(
  accessToken: string,
  path: string,
  method: 'POST' | 'PATCH',
  body: unknown,
  signal?: AbortSignal,
): Promise<WriteFlowResult> {
  const result = await call(
    accessToken,
    path,
    { method, body: JSON.stringify(body) },
    signal,
  );
  if (!result.ok) return result;
  const flow = parseFlowRecord(result.body);
  return flow ? { ok: true, flow } : { ok: false, reason: 'failed' };
}

/**
 * Creates a person (owners only; a member gets `forbidden`). The id is made on the device. This is
 * a plain POST, never an upsert: a repeat for an existing id is a `conflict`. The body is rebuilt
 * from the whitelist (facts, then any detail keys) and validated before sending (C2/C3, C8).
 */
export function createFlow(
  accessToken: string,
  id: string,
  fields: FlowFacts & Partial<FlowDetails>,
  signal?: AbortSignal,
): Promise<WriteFlowResult> {
  const facts = parseFlowFacts(pickFlowFacts(fields));
  const details = parseFlowDetails(pickFlowDetails(fields));
  if (!isUuid(id) || !facts || !details) {
    return Promise.resolve({ ok: false, reason: 'invalid' });
  }
  return send(accessToken, '/flows', 'POST', { id, ...facts, ...details }, signal);
}

/** Edits a person. Sends only the changed whitelisted fields; an empty patch sends nothing. */
export function patchFlow(
  accessToken: string,
  id: string,
  partial: Partial<SyncedFields>,
  signal?: AbortSignal,
): Promise<PatchFlowResult> {
  const body = parseSyncedPatch({ ...pickFlowFacts(partial), ...pickFlowDetails(partial) });
  if (!isUuid(id) || !body) {
    return Promise.resolve({ ok: false, reason: 'invalid' });
  }
  if (Object.keys(body).length === 0) {
    return Promise.resolve({ ok: true, flow: null });
  }
  return send(accessToken, `/flows/${encodeURIComponent(id)}`, 'PATCH', body, signal);
}
