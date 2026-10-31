// Person (flow) routes. Every route sits behind clerkAuth and calls the data function as the
// signed-in caller. The body is checked with the shared parsers before any data call (C2, C3, C8):
// unknown, forbidden and over-length keys are refused with 400. Copy is calm (C7).
import { Hono, type Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import {
  clerkAuth,
  type ClerkAuthVariables,
  type ClerkConfig,
  type DataFunctionConfig,
  type callData,
} from '@griever/gateway-auth';
import {
  isPlainObject,
  isUuid,
  parseFlowDetails,
  parseFlowFacts,
  parseFlowPatch,
  splitSyncedPatch,
  type DataResult,
  type FlowRecord,
} from '@griever/shared';
import { createFlowsClient } from './flowsClient.js';

type Env = { Variables: ClerkAuthVariables };

export interface FlowsRouterConfig {
  /** Read per request; null when CLERK_ISSUER is unset. */
  getAuthConfig: () => ClerkConfig | null;
  /** Read per request; null when the data function URL is unset. */
  getDataConfig: () => DataFunctionConfig | null;
  /** Overridable in tests. */
  callData?: typeof callData;
}

/** The largest body accepted. The biggest honest body is well under this (obituary text is 10,000 characters). */
export const MAX_BODY_BYTES = 128 * 1024;

export const FLOWS_UNAVAILABLE = 'Your people are not available right now. Please try again in a moment.';
export const FLOWS_BAD_BODY = 'That request could not be understood.';
export const FLOWS_TOO_LARGE = 'That request is too large.';
export const FLOWS_FORBIDDEN = "You can't change this person's details.";
export const FLOWS_CANNOT_ADD = 'Only the person who owns this account can add someone.';

type Failure = { status: 400 | 401 | 403 | 404 | 409 | 503; error: string };

/** What each data function failure says to the caller. Unknown codes and busy are 503. */
export function flowsFailureFor(code: string): Failure {
  switch (code) {
    case 'invalid':
      return { status: 400, error: FLOWS_BAD_BODY };
    case 'unauthorized':
      return { status: 401, error: 'Please sign in again.' };
    case 'forbidden':
      return { status: 403, error: FLOWS_FORBIDDEN };
    case 'not_found':
      return { status: 404, error: 'That could not be found.' };
    case 'conflict':
      return { status: 409, error: 'That person already exists.' };
    default:
      return { status: 503, error: FLOWS_UNAVAILABLE };
  }
}

async function readJsonObject(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = await req.json();
    return isPlainObject(body) ? body : null;
  } catch {
    return null;
  }
}

/** The six facts plus any details, rebuilt from the whitelist; null if anything is refused. */
export function parseCreateFields(body: Record<string, unknown>): Record<string, unknown> | null {
  const split = splitSyncedPatch(body);
  if (!split) {
    return null;
  }
  const facts = parseFlowFacts(split.facts);
  const details = parseFlowDetails(split.details);
  return facts && details ? { ...facts, ...details } : null;
}

/** Changed facts plus changed details, rebuilt from the whitelist; null if anything is refused. */
export function parsePatchFields(body: Record<string, unknown>): Record<string, unknown> | null {
  const split = splitSyncedPatch(body);
  if (!split) {
    return null;
  }
  const facts = parseFlowPatch(split.facts);
  const details = parseFlowDetails(split.details);
  return facts && details ? { ...facts, ...details } : null;
}

export function createFlowsRouter(config: FlowsRouterConfig) {
  const router = new Hono<Env>();
  const client = createFlowsClient({
    getDataConfig: config.getDataConfig,
    ...(config.callData ? { callData: config.callData } : {}),
  });

  const limit = bodyLimit({
    maxSize: MAX_BODY_BYTES,
    onError: (c) => c.json({ error: FLOWS_TOO_LARGE }, 413),
  });
  // Each path is registered once. Limit runs after auth, so a caller with no token gets 401 whatever the size.
  for (const path of ['/flows', '/flows/*']) {
    router.use(path, clerkAuth(config.getAuthConfig), limit);
  }

  const respond = (
    c: Context<Env>,
    result: DataResult<FlowRecord | FlowRecord[]> | null,
    okStatus: 200 | 201,
    forbiddenCopy = FLOWS_FORBIDDEN,
  ) => {
    if (!result) {
      return c.json({ error: FLOWS_UNAVAILABLE }, 503);
    }
    if (!result.ok) {
      const { status, error } = flowsFailureFor(result.code);
      return c.json({ error: result.code === 'forbidden' ? forbiddenCopy : error }, status);
    }
    return c.json(result.data, okStatus);
  };

  router.get('/flows', async (c) => respond(c, await client.list(c.get('accessToken')), 200));

  router.post('/flows', async (c) => {
    const body = await readJsonObject(c.req.raw);
    const id = body?.['id'];
    if (!body || typeof id !== 'string' || !isUuid(id)) {
      return c.json({ error: FLOWS_BAD_BODY }, 400);
    }
    const { id: _id, ...rest } = body;
    const fields = parseCreateFields(rest);
    if (!fields) {
      return c.json({ error: FLOWS_BAD_BODY }, 400);
    }
    return respond(c, await client.create(c.get('accessToken'), id, fields), 201, FLOWS_CANNOT_ADD);
  });

  router.patch('/flows/:id', async (c) => {
    const id = c.req.param('id');
    if (!isUuid(id)) {
      return c.json({ error: FLOWS_BAD_BODY }, 400);
    }
    const body = await readJsonObject(c.req.raw);
    const patch = body ? parsePatchFields(body) : null;
    // An empty patch changes nothing, so it is refused rather than sent.
    if (!patch || Object.keys(patch).length === 0) {
      return c.json({ error: FLOWS_BAD_BODY }, 400);
    }
    return respond(c, await client.update(c.get('accessToken'), id, patch), 200);
  });

  return router;
}

/** The live router: env is read per request, so unset values mean 503, not a failed start. */
export const flowsRouter = createFlowsRouter({
  getAuthConfig: () => {
    const issuer = process.env['CLERK_ISSUER']?.trim();
    if (!issuer) {
      return null;
    }
    const authorizedParties = (process.env['CLERK_AUTHORIZED_PARTIES'] ?? '')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean);
    return { issuer, authorizedParties };
  },
  getDataConfig: () => {
    const url = process.env['DATA_FUNCTION_URL']?.trim();
    if (!url) {
      return null;
    }
    return {
      url,
      region: process.env['DATA_FUNCTION_REGION']?.trim(),
      accessKeyId: process.env['DATA_FUNCTION_ACCESS_KEY_ID'],
      secretAccessKey: process.env['DATA_FUNCTION_SECRET_ACCESS_KEY'],
    };
  },
});
