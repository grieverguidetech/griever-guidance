/** 1s → 2s → 4s → … capped at 5 min (DATA.md §4.5). Silent — no UI surface. */
const CAP_MS = 5 * 60 * 1000;

export function nextBackoffDelay(attempt: number): number {
  const delay = 1000 * Math.pow(2, attempt);
  return Math.min(delay, CAP_MS);
}

export interface RetryLoopHandle {
  stop(): void;
}

/**
 * Retries `task` with the backoff schedule above until it resolves without
 * throwing, or `stop()` is called. Failures are swallowed here deliberately —
 * DATA.md §4.6: a failed background flush retries silently, no error dialog.
 */
export function retryWithBackoff(
  task: () => Promise<void>,
  scheduleTimeout: (fn: () => void, ms: number) => unknown = (fn, ms) => setTimeout(fn, ms),
  clearScheduled: (handle: unknown) => void = (handle) => clearTimeout(handle as Parameters<typeof clearTimeout>[0]),
): RetryLoopHandle {
  let attempt = 0;
  let stopped = false;
  let timer: unknown;

  const run = () => {
    if (stopped) return;
    task()
      .then(() => {
        attempt = 0;
      })
      .catch(() => {
        if (stopped) return;
        const delay = nextBackoffDelay(attempt);
        attempt += 1;
        timer = scheduleTimeout(run, delay);
      });
  };
  run();

  return {
    stop() {
      stopped = true;
      if (timer !== undefined) clearScheduled(timer);
    },
  };
}
