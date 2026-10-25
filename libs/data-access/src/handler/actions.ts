import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import {
  DATA_ACTIONS,
  isDataErrorCode,
  isUuid,
  parseFlowFacts,
  parseFlowPatch,
  parseInviteEmail,
  type DataAction,
  type DataResult,
} from '@griever/shared';
import type { Caller } from '../caller.js';
import type { Clock } from '../clock.js';
import { BUSY_MESSAGE } from '../errors.js';
import type { acceptInvite } from '../rules/acceptInvite.js';
import type { createFlow, listFlows, updateFlow } from '../rules/flows.js';
import type { createInvite, revokeInvite } from '../rules/invites.js';
import type { listMembers, removeMember } from '../rules/members.js';
import { parseProfileFields, type getProfile, type putProfile } from '../rules/profiles.js';

/**
 * The rules this handler can call. They are injected, so this file never imports a concrete rule
 * and a test can swap one out. Each type is the real rule's own signature.
 */
export interface DataRules {
  getProfile: typeof getProfile;
  putProfile: typeof putProfile;
  listFlows: typeof listFlows;
  createFlow: typeof createFlow;
  updateFlow: typeof updateFlow;
  createInvite: typeof createInvite;
  revokeInvite: typeof revokeInvite;
  listMembers: typeof listMembers;
  removeMember: typeof removeMember;
  acceptInvite: typeof acceptInvite;
}

/** Everything one action needs, built per request after the token check. */
export interface ActionContext {
  rules: DataRules;
  doc: DynamoDBDocumentClient;
  table: string;
  clock: Clock;
  caller: Caller;
}

/** An action whose args already passed validation. Calling it is the first step that can touch DynamoDB. */
export type PreparedAction = (ctx: ActionContext) => Promise<DataResult>;

type Args = Record<string, unknown>;
type Prepare = (args: Args) => PreparedAction | null;

const TOKEN_HASH = /^[0-9a-f]{64}$/;
// Same pattern as the user id check in keys.ts.
const USER_ID = /^[A-Za-z0-9_-]{1,64}$/;

/** True when args has exactly these keys: no missing key, no extra key. */
function hasExactKeys(args: Args, keys: readonly string[]): boolean {
  const own = Object.keys(args);
  return own.length === keys.length && keys.every((key) => Object.prototype.hasOwnProperty.call(args, key));
}

function uuidArg(value: unknown): value is string {
  return typeof value === 'string' && isUuid(value);
}

/** Maps a rule outcome to the wire shape. Failures keep only the code (and a calm message for busy). */
function toResult(outcome: { ok: true; value: unknown } | { ok: false; code: string }): DataResult {
  if (outcome.ok) {
    return { ok: true, data: outcome.value };
  }
  const { code } = outcome;
  if (!isDataErrorCode(code)) {
    throw new Error('A rule returned an unknown error code.');
  }
  return code === 'busy' ? { ok: false, code, message: BUSY_MESSAGE } : { ok: false, code };
}

const PREPARE: Record<DataAction, Prepare> = {
  getProfile: (args) => {
    if (!hasExactKeys(args, [])) {
      return null;
    }
    return async (c) => ({ ok: true, data: await c.rules.getProfile(c.doc, c.table, c.caller, c.clock) });
  },
  putProfile: (args) => {
    const fields = hasExactKeys(args, ['fields']) ? parseProfileFields(args['fields']) : null;
    if (!fields) {
      return null;
    }
    return async (c) => toResult(await c.rules.putProfile(c.doc, c.table, c.caller, fields, c.clock));
  },
  listFlows: (args) => {
    if (!hasExactKeys(args, [])) {
      return null;
    }
    return async (c) => ({ ok: true, data: await c.rules.listFlows(c.doc, c.table, c.caller, c.clock) });
  },
  createFlow: (args) => {
    const id = args['id'];
    if (!hasExactKeys(args, ['id', 'facts']) || !uuidArg(id) || !parseFlowFacts(args['facts'])) {
      return null;
    }
    const facts = args['facts'];
    return async (c) => toResult(await c.rules.createFlow(c.doc, c.table, c.caller, id, facts, c.clock));
  },
  updateFlow: (args) => {
    const id = args['id'];
    if (!hasExactKeys(args, ['id', 'patch']) || !uuidArg(id) || !parseFlowPatch(args['patch'])) {
      return null;
    }
    const patch = args['patch'];
    return async (c) => toResult(await c.rules.updateFlow(c.doc, c.table, c.caller, id, patch, c.clock));
  },
  createInvite: (args) => {
    const { email, tokenHash } = args;
    if (
      !hasExactKeys(args, ['email', 'tokenHash']) ||
      typeof email !== 'string' ||
      !parseInviteEmail(email) ||
      typeof tokenHash !== 'string' ||
      !TOKEN_HASH.test(tokenHash)
    ) {
      return null;
    }
    return async (c) => toResult(await c.rules.createInvite(c.doc, c.table, c.caller, email, tokenHash, c.clock));
  },
  revokeInvite: (args) => {
    const id = args['id'];
    if (!hasExactKeys(args, ['id']) || !uuidArg(id)) {
      return null;
    }
    return async (c) => toResult(await c.rules.revokeInvite(c.doc, c.table, c.caller, id, c.clock));
  },
  listMembers: (args) => {
    if (!hasExactKeys(args, [])) {
      return null;
    }
    return async (c) => ({ ok: true, data: await c.rules.listMembers(c.doc, c.table, c.caller, c.clock) });
  },
  removeMember: (args) => {
    const memberId = args['memberId'];
    if (!hasExactKeys(args, ['memberId']) || typeof memberId !== 'string' || !USER_ID.test(memberId)) {
      return null;
    }
    return async (c) => toResult(await c.rules.removeMember(c.doc, c.table, c.caller, memberId, c.clock));
  },
  acceptInvite: (args) => {
    const tokenHash = args['tokenHash'];
    if (!hasExactKeys(args, ['tokenHash']) || typeof tokenHash !== 'string' || !TOKEN_HASH.test(tokenHash)) {
      return null;
    }
    return async (c) => toResult(await c.rules.acceptInvite(c.doc, c.table, c.caller, tokenHash, c.clock));
  },
};

/** The action names this handler serves. A test compares it with DATA_ACTIONS. */
export const HANDLED_ACTIONS: readonly string[] = Object.keys(PREPARE);

/**
 * Validates one action's args (C8). Returns null for any bad shape, unknown key, or bad value.
 * No DynamoDB call happens here. Unknown actions, including `deleteUserData`, return null too.
 */
export function prepareAction(action: string, args: Args): PreparedAction | null {
  if (!(DATA_ACTIONS as readonly string[]).includes(action)) {
    return null;
  }
  return PREPARE[action as DataAction](args);
}
