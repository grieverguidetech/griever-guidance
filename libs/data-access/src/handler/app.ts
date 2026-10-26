import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { createHash, timingSafeEqual } from 'node:crypto';
import {
  DATA_SERVICE_DELETE_USER_PATH,
  DATA_SERVICE_SECRET_HEADER,
  DATA_USER_TOKEN_HEADER,
  type DataResult,
} from '@griever/shared';
import { Hono } from 'hono';
import type { Caller } from '../caller.js';
import { systemClock, type Clock } from '../clock.js';
import { prepareAction, type DataRules } from './actions.js';

export interface DataAppOptions {
  rules: DataRules;
  doc: DynamoDBDocumentClient;
  table: string;
  /** Checks the user's token. Returns null for a bad, wrong or expired token. */
  verify: (token: string) => Promise<Caller | null>;
  clock?: Clock;
  /** Shared secret for the service path. Unset means that path answers 404 (it is off). */
  serviceSecret?: string;
  /** Deletes all of one user's data. Only the service path calls it. */
  deleteUser?: (
    doc: DynamoDBDocumentClient,
    table: string,
    userId: string,
    clock: Clock,
  ) => Promise<void>;
  /** Gets the action name and the error class only: never a message, token, email or hash. */
  onError?: (action: string, errorName: string) => void;
}

const USER_ID = /^[A-Za-z0-9_-]{1,64}$/;

/** Constant-time compare of two secrets (hashed first, so the lengths match). */
function sameSecret(given: string | undefined, expected: string): boolean {
  if (!given) {
    return false;
  }
  const a = createHash('sha256').update(given).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * The data function: `POST /v1` and nothing else. Order matters (C8): user token, then envelope,
 * then the action's args. Each one can refuse before DynamoDB is touched.
 * Domain outcomes answer 200 with a DataResult. Anything unexpected answers 500 with no detail.
 */
export function createDataApp(options: DataAppOptions): Hono {
  const clock = options.clock ?? systemClock;
  const onError =
    options.onError ??
    ((action, errorName) =>
      console.error(`data action failed: ${action} (${errorName})`));
  const app = new Hono();

  // Service path (#327): no user token. Function URL auth (SigV4) already limits callers to the
  // gateway's IAM user; the shared secret is a second lock. Never reachable with a user token alone.
  app.post(DATA_SERVICE_DELETE_USER_PATH, async (c) => {
    if (!options.serviceSecret || !options.deleteUser) {
      return c.json({ error: 'not_found' }, 404);
    }
    if (
      !sameSecret(
        c.req.header(DATA_SERVICE_SECRET_HEADER),
        options.serviceSecret,
      )
    ) {
      return c.json({ error: 'unauthorized' }, 401);
    }
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'bad_request' }, 400);
    }
    const userId =
      isPlainObject(body) && Object.keys(body).length === 1
        ? body['userId']
        : undefined;
    if (typeof userId !== 'string' || !USER_ID.test(userId)) {
      return c.json({ error: 'bad_request' }, 400);
    }
    try {
      await options.deleteUser(options.doc, options.table, userId, clock);
      return c.json({ ok: true, data: null }, 200);
    } catch (error) {
      onError('deleteUser', error instanceof Error ? error.name : 'unknown');
      return c.json({ error: 'internal' }, 500);
    }
  });

  app.post('/v1', async (c) => {
    const token = c.req.header(DATA_USER_TOKEN_HEADER);
    let caller: Caller | null = null;
    try {
      caller = token ? await options.verify(token) : null;
    } catch (error) {
      onError('verify', error instanceof Error ? error.name : 'unknown');
      return c.json({ error: 'internal' }, 500);
    }
    if (!caller) {
      return c.json({ error: 'unauthorized' }, 401);
    }

    let envelope: unknown;
    try {
      envelope = await c.req.json();
    } catch {
      return c.json({ error: 'bad_request' }, 400);
    }
    if (
      !isPlainObject(envelope) ||
      Object.keys(envelope).length !== 2 ||
      typeof envelope['action'] !== 'string' ||
      !isPlainObject(envelope['args'])
    ) {
      return c.json({ error: 'bad_request' }, 400);
    }
    const action = envelope['action'];
    const prepared = prepareAction(action, envelope['args']);
    if (!prepared) {
      return c.json({ error: 'bad_request' }, 400);
    }

    try {
      const result: DataResult = await prepared({
        rules: options.rules,
        doc: options.doc,
        table: options.table,
        clock,
        caller,
      });
      return c.json(result, 200);
    } catch (error) {
      onError(action, error instanceof Error ? error.name : 'unknown');
      return c.json({ error: 'internal' }, 500);
    }
  });

  // Hono would log the raw error message. Log the class only.
  app.onError((error, c) => {
    onError('unhandled', error.name);
    return c.json({ error: 'internal' }, 500);
  });

  return app;
}
