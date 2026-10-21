import { randomUUID } from 'node:crypto';
import { TransactWriteCommand, type TransactWriteCommandInput } from '@aws-sdk/lib-dynamodb';

export type TransactItem = NonNullable<TransactWriteCommandInput['TransactItems']>[number];

/** The one thing the runner needs from the document client. */
export interface TransactClient {
  send(command: TransactWriteCommand): Promise<unknown>;
}

/** One attempt: either committed, a condition failed at an item index, or two writers collided. */
export type TransactOutcome = { status: 'ok' } | { status: 'failed'; failedIndex: number } | { status: 'conflict' };

interface CancellationReason {
  Code?: string;
}

function cancellationReasons(error: unknown): CancellationReason[] | undefined {
  const e = error as { name?: string; CancellationReasons?: CancellationReason[] };
  return e?.name === 'TransactionCanceledException' ? (e.CancellationReasons ?? []) : undefined;
}

/**
 * Runs one TransactWriteItems. A failed condition returns the index of the first failing item, so the
 * caller can map it to a reason. A TransactionConflict (two in flight) returns `conflict`.
 * Anything else is thrown.
 */
export async function transact(
  client: TransactClient,
  items: TransactItem[],
  token: string = randomUUID(),
): Promise<TransactOutcome> {
  try {
    // The token is made here, outside the SDK, so the SDK's own resends reuse it. If a response is lost
    // after the commit, the resend is recognised and does not turn a committed write into a refusal.
    await client.send(new TransactWriteCommand({ TransactItems: items, ClientRequestToken: token }));
    return { status: 'ok' };
  } catch (error) {
    const reasons = cancellationReasons(error);
    if (!reasons) throw error;
    if (reasons.some((r) => r.Code === 'TransactionConflict')) return { status: 'conflict' };
    const failedIndex = reasons.findIndex((r) => r.Code === 'ConditionalCheckFailed');
    if (failedIndex >= 0) return { status: 'failed', failedIndex };
    throw error;
  }
}

/** What an action decided after its reads: the writes, a result, and which failures mean "stale". */
export interface ActionPlan<T> {
  items: TransactItem[];
  value: T;
  /** Item indexes whose failure means the reads were stale (a version check). They cause a re-run. */
  retryOn?: number[];
}

export type ActionResult<T> =
  | { status: 'ok'; value: T }
  | { status: 'failed'; failedIndex: number }
  | { status: 'busy' };

export const MAX_ATTEMPTS = 3;

export interface RunOptions {
  /** Test seam: runs after the action's reads and before its commit. */
  beforeCommit?: (attempt: number) => Promise<void>;
  /** Test seam: replaces the wait before a re-run. */
  sleep?: (ms: number) => Promise<void>;
  /** Test seam: replaces Math.random for the wait. */
  random?: () => number;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** A short random wait of 20 to 100 ms, so two colliding writers do not collide again together. */
export function backoffMs(random: () => number = Math.random): number {
  return 20 + Math.floor(random() * 80);
}

/**
 * Runs a whole action (reads, decision, transaction) at most 3 times. It runs again on a conflict or
 * when a `retryOn` condition fails, after a short random wait.
 * A rule that reads a missing profile must list the profile item index in `retryOn`. After 3 tries it returns `busy`, which the gateway turns into 503.
 */
export async function runAction<T>(
  client: TransactClient,
  action: (attempt: number) => Promise<ActionPlan<T>>,
  options: RunOptions = {},
): Promise<ActionResult<T>> {
  const sleep = options.sleep ?? defaultSleep;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    if (attempt > 1) await sleep(backoffMs(options.random));
    const plan = await action(attempt);
    await options.beforeCommit?.(attempt);
    const outcome = await transact(client, plan.items, randomUUID());
    if (outcome.status === 'ok') return { status: 'ok', value: plan.value };
    if (outcome.status === 'failed' && !plan.retryOn?.includes(outcome.failedIndex)) {
      return { status: 'failed', failedIndex: outcome.failedIndex };
    }
  }
  return { status: 'busy' };
}
