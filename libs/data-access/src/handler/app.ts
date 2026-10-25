import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { DATA_USER_TOKEN_HEADER, type DataResult } from '@griever/shared';
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
  /** Gets the action name and the error class only: never a message, token, email or hash. */
  onError?: (action: string, errorName: string) => void;
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
    options.onError ?? ((action, errorName) => console.error(`data action failed: ${action} (${errorName})`));
  const app = new Hono();

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

  return app;
}
