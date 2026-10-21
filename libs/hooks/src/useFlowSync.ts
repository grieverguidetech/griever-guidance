import { useEffect, useRef, useState } from 'react';
import { createFlow, listFlows, patchFlow } from '@griever/api-client';
import type {
  FlowsFailureReason,
  ListFlowsResult,
  PatchFlowResult,
  WriteFlowResult,
} from '@griever/api-client';
import {
  coalesceFlowPatches,
  diffFlowFacts,
  FLOW_FACT_KEYS,
  isUuid,
  parseFlowFacts,
  parseFlowPatch,
  toFlowFacts,
} from '@griever/shared';
import type { FlowFactKey, FlowFacts, FlowRecord } from '@griever/shared';
import type { SendFlowStorage } from './useSendFlow.js';
import { readRemovedFlows, writeRemovedFlows } from './useSessions.js';
import type { Session, UseSessionsResult } from './useSessions.js';

/** The api-client functions the hook uses. Tests pass a stub; the default is the real module. */
export interface FlowSyncClient {
  listFlows: (accessToken: string, signal?: AbortSignal) => Promise<ListFlowsResult>;
  createFlow: (accessToken: string, id: string, facts: FlowFacts, signal?: AbortSignal) => Promise<WriteFlowResult>;
  patchFlow: (
    accessToken: string,
    id: string,
    partial: Partial<FlowFacts>,
    signal?: AbortSignal,
  ) => Promise<PatchFlowResult>;
}

const defaultClient: FlowSyncClient = { listFlows, createFlow, patchFlow };

export interface UseFlowSyncOptions {
  sessions: readonly Session[];
  /** The signed-in account's id. Empty means signed out: nothing is sent. */
  userId: string;
  getAccessToken: () => Promise<string | null>;
  /** False makes no requests at all. */
  enabled: boolean;
  storage?: SendFlowStorage;
  /** The app calls `onWake` when it may be online again (web: online/visibility; mobile: AppState). */
  subscribe: (onWake: () => void) => () => void;
  applyRemoteFlows: UseSessionsResult['applyRemoteFlows'];
  client?: FlowSyncClient;
}

/** For tests only. Nothing in the UI reads it (C5: no visible sync state). */
export interface UseFlowSyncResult {
  lastError: FlowsFailureReason | null;
}

export const FLOW_QUEUE_STORAGE_KEY = 'gg.flowQueue.v1';
/** One record per account, so signing in as someone else and back keeps the first queue. */
export const flowQueueKey = (userId: string): string => `${FLOW_QUEUE_STORAGE_KEY}:${userId}`;
export const BACKOFF_START_MS = 5_000;
export const BACKOFF_MAX_MS = 300_000;
export const PULL_INTERVAL_MS = 600_000;
export const EDIT_DEBOUNCE_MS = 1_000;
export const REQUEST_TIMEOUT_MS = 15_000;

type Pending = Partial<FlowFacts>;

interface Stored {
  queue: Record<string, Pending>;
  /** Flows the server is known to have, so the next write is a PATCH. */
  known: string[];
  /** The facts last seen per person (facts only), so edits made while sync was off are still found. */
  baselines: Record<string, FlowFacts>;
}

interface SyncState {
  userId: string;
  queue: Map<string, Pending>;
  known: Set<string>;
  /** The facts last seen per flow, to tell what the user changed. Saved in storage. */
  baselines: Map<string, FlowFacts>;
  /** True once a pull has worked this run: only then do we know which people the server lacks. */
  pulled: boolean;
  /** People the server refused to create; not offered again this run. */
  refused: Set<string>;
}

function readStored(storage: SendFlowStorage | undefined, userId: string): SyncState {
  const state: SyncState = { userId, queue: new Map(), known: new Set(), baselines: new Map(), pulled: false, refused: new Set() };
  if (!storage) return state;
  try {
    const raw = storage.getItem(flowQueueKey(userId));
    if (!raw) return state;
    const parsed = JSON.parse(raw) as Partial<Stored> | null;
    if (!parsed) return state;
    for (const [id, pending] of Object.entries(parsed.queue ?? {})) {
      const clean = isUuid(id) ? parseFlowPatch(pending) : null;
      if (clean && Object.keys(clean).length > 0) state.queue.set(id, clean);
    }
    for (const [id, facts] of Object.entries(parsed.baselines ?? {})) {
      const clean = isUuid(id) ? parseFlowFacts(facts) : null;
      if (clean) state.baselines.set(id, clean);
    }
    for (const id of parsed.known ?? []) if (typeof id === 'string' && isUuid(id)) state.known.add(id);
  } catch {
    // unreadable storage: start empty
  }
  return state;
}

function writeStored(storage: SendFlowStorage | undefined, state: SyncState): void {
  if (!storage) return;
  try {
    const stored: Stored = {
      queue: Object.fromEntries(state.queue),
      known: [...state.known],
      baselines: Object.fromEntries(state.baselines),
    };
    storage.setItem(flowQueueKey(state.userId), JSON.stringify(stored));
  } catch {
    // storage unavailable: the queue still works for this run
  }
}

/** Only an owner session (made here or by this account) may be created on the server. */
const mayCreate = (s: Session, userId: string): boolean =>
  s.role === 'owner' && (s.ownerId === null || s.ownerId === userId);

/** Someone else's account's person on this device is never sent. */
const isMine = (s: Session, userId: string): boolean =>
  s.role === 'member' || s.ownerId === null || s.ownerId === userId;

/** Stops one request: clears its timer and aborts it. Called on unmount. */
type Cancel = () => void;

/**
 * The request can hang forever in some runtimes, so the queue stops waiting after a while. On
 * timeout the request is also aborted, so a stale PATCH can't land after a newer one (#164).
 * Whatever the aborted request later returns is ignored: this has already resolved with `fallback`.
 */
function withTimeout<T>(start: (signal: AbortSignal) => Promise<T>, fallback: T, inFlight: Set<Cancel>): Promise<T> {
  const controller = new AbortController();
  return new Promise<T>((resolve) => {
    const cancel: Cancel = () => {
      clearTimeout(timer);
      inFlight.delete(cancel);
      controller.abort();
    };
    const done = (value: T) => {
      clearTimeout(timer);
      inFlight.delete(cancel);
      resolve(value);
    };
    const timer = setTimeout(() => {
      cancel();
      done(fallback);
    }, REQUEST_TIMEOUT_MS);
    inFlight.add(cancel);
    let promise: Promise<T>;
    try {
      promise = start(controller.signal);
    } catch {
      promise = Promise.resolve(fallback);
    }
    promise.then(done, () => done(fallback));
  });
}

/**
 * Notices what changed since the last look and queues it. A person the server may not have is
 * queued whole, but only after a pull has shown what the server has. `queue` is true if the
 * queue changed; `dirty` if anything saved did.
 */
function scanSessions(
  state: SyncState,
  sessions: readonly Session[],
  userId: string,
  removed: ReadonlySet<string>,
): { queue: boolean; dirty: boolean } {
  let changed = false;
  let dirty = false;
  const seen = new Set<string>();
  const present = new Set(sessions.map((s) => s.flowId));
  for (const s of sessions) {
    if (!isMine(s, userId)) continue;
    seen.add(s.flowId);
    const facts = toFlowFacts(s);
    const before = state.baselines.get(s.flowId);
    state.baselines.set(s.flowId, facts);
    const diff = before ? diffFlowFacts(before, facts) : {};
    if (!before || Object.keys(diff).length > 0) dirty = true;
    const unsent =
      state.pulled &&
      mayCreate(s, userId) &&
      !state.known.has(s.flowId) &&
      !state.refused.has(s.flowId) &&
      !state.queue.has(s.flowId) &&
      facts.personName !== '';
    if (unsent) {
      state.queue.set(s.flowId, { ...facts });
      changed = true;
    } else if (Object.keys(diff).length > 0) {
      state.queue.set(s.flowId, coalesceFlowPatches([state.queue.get(s.flowId) ?? {}, diff]));
      changed = true;
    }
  }
  // Unsent edits of a person removed on purpose (removeSession) are forgotten. A person who is
  // merely missing (unreadable storage, access lost) is not treated as removed.
  for (const id of [...state.queue.keys()]) {
    if (!present.has(id) && removed.has(id)) {
      state.queue.delete(id);
      dirty = true;
    }
  }
  for (const id of [...state.baselines.keys()]) {
    if (seen.has(id)) continue;
    state.baselines.delete(id);
    dirty = true;
  }
  return { queue: changed, dirty: dirty || changed };
}

const offline = { ok: false, reason: 'offline' } as const;

/**
 * Sends edits to a person's six facts in the background (DS-6). The device stays the source of
 * truth: edits are queued per flow, coalesced, and sent as POST (a person the server hasn't seen)
 * or PATCH (only the pending keys). Nothing on screen waits for this (C5). Failures are kept in
 * the queue and retried; nothing is thrown and no state is shown.
 */
export function useFlowSync(options: UseFlowSyncOptions): UseFlowSyncResult {
  const [lastError, setLastError] = useState<FlowsFailureReason | null>(null);
  const latest = useRef(options);
  latest.current = options;
  const stateRef = useRef<SyncState | null>(null);
  // Set by the effect below; lets the sessions effect ask for a flush.
  const kickRef = useRef<(delayMs: number) => void>(() => undefined);

  const { enabled, userId, sessions } = options;
  const active = enabled && userId !== '';

  // Notice edits. Runs after every sessions change.
  useEffect(() => {
    if (!active) return;
    const { storage } = latest.current;
    if (stateRef.current?.userId !== userId) stateRef.current = readStored(storage, userId);
    const state = stateRef.current;
    try {
      const { queue, dirty } = scanSessions(state, sessions, userId, new Set((readRemovedFlows(storage) ?? []).map((m) => m.id)));
      if (dirty) writeStored(storage, state);
      if (queue) kickRef.current(EDIT_DEBOUNCE_MS);
    } catch {
      // Never thrown to the app (C5). The next change scans again.
    }
  }, [active, userId, sessions]);

  // Run the sync: pull on start, on wake and on an interval; flush on edits.
  useEffect(() => {
    if (!active) return;
    let alive = true;
    let running = false;
    let again = false;
    let needPull = true;
    let failures = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const inFlight = new Set<Cancel>();
    let softFailure = false;
    const fail = (reason: FlowsFailureReason | null) => {
      setLastError((prev) => (prev === reason ? prev : reason));
    };
    const getState = (): SyncState => {
      if (stateRef.current?.userId !== userId) stateRef.current = readStored(latest.current.storage, userId);
      return stateRef.current;
    };
    const token = async (): Promise<string | null> => {
      try {
        return await latest.current.getAccessToken();
      } catch {
        return null;
      }
    };
    const client = () => latest.current.client ?? defaultClient;

    const pull = async (accessToken: string): Promise<boolean> => {
      const result = await withTimeout((signal) => client().listFlows(accessToken, signal), offline, inFlight);
      if (!alive) return false;
      if (!result.ok) {
        fail(result.reason);
        return false;
      }
      const state = getState();
      // Sync lag: a person removed here (removeSession) that the server still lists is left out. Once a clean pull no longer
      // lists the id, it is forgotten. A pull that dropped records may be hiding it, so keep it then.
      // Marks name the owner, so another account's pull neither hides nor prunes this account's marks.
      const marks = readRemovedFlows(latest.current.storage);
      const mine = new Set((marks ?? []).filter((m) => m.ownerId === null || m.ownerId === userId).map((m) => m.id));
      const flows = result.flows.filter((r) => !(mine.has(r.id) && r.ownerId === userId));
      if (marks && !result.dropped) {
        const listed = new Set(result.flows.filter((r) => r.ownerId === userId).map((r) => r.id));
        const kept = marks.filter((m) => !mine.has(m.id) || listed.has(m.id));
        if (kept.length !== marks.length) writeRemovedFlows(latest.current.storage, kept);
      }
      markKnown(state, flows, userId);
      state.pulled = true;
      try {
        scanSessions(state, latest.current.sessions, userId, new Set((marks ?? []).map((m) => m.id)));
      } catch {
        // keep pulling; the next change scans again
      }
      const pendingByFlow: Record<string, FlowFactKey[]> = {};
      for (const [id, pending] of state.queue) {
        pendingByFlow[id] = FLOW_FACT_KEYS.filter((key) => key in pending);
      }
      // Records already merged into sessions must not look like local edits afterwards.
      for (const record of flows) {
        const base = state.baselines.get(record.id);
        if (!base) continue;
        const pendingKeys = new Set(pendingByFlow[record.id] ?? []);
        const next: Record<string, unknown> = { ...base };
        for (const key of FLOW_FACT_KEYS) if (!pendingKeys.has(key)) next[key] = record.facts[key];
        state.baselines.set(record.id, next as unknown as FlowFacts);
      }
      writeStored(latest.current.storage, state);
      latest.current.applyRemoteFlows({ flows, dropped: result.dropped }, userId, pendingByFlow);
      return true;
    };

    /** Sends every queued flow. Returns false when a retryable failure means "stop and back off". */
    const flush = async (accessToken: string): Promise<boolean> => {
      const state = getState();
      softFailure = false;
      for (const id of [...state.queue.keys()]) {
        for (;;) {
          if (!alive) return true;
          const pending = state.queue.get(id);
          const session = latest.current.sessions.find((s) => s.flowId === id);
          if (!pending || !session || !isMine(session, userId)) {
            state.queue.delete(id);
            break;
          }
          const create = mayCreate(session, userId) && !state.known.has(id);
          const sent: Pending = create ? toFlowFacts(session) : { ...pending };
          const result = await withTimeout<WriteFlowResult | PatchFlowResult>(
            (signal) =>
              create
                ? client().createFlow(accessToken, id, sent as FlowFacts, signal)
                : client().patchFlow(accessToken, id, sent, signal),
            offline,
            inFlight,
          );
          if (!alive) return true;
          if (result.ok) {
            state.known.add(id);
            const now = state.queue.get(id) ?? {};
            // Keep only what changed while the request was in flight.
            const left: Record<string, unknown> = {};
            for (const key of FLOW_FACT_KEYS) {
              if (key in now && now[key] !== sent[key]) left[key] = now[key];
            }
            if (Object.keys(left).length > 0) state.queue.set(id, left as Pending);
            else state.queue.delete(id);
            writeStored(latest.current.storage, state);
            break;
          }
          if (result.reason === 'conflict' && create) {
            state.known.add(id); // the server has it already: edit it instead
            continue;
          }
          if (result.reason === 'forbidden' || result.reason === 'not_found' || result.reason === 'invalid') {
            // This patch can never succeed. Drop it; a pull brings back what the server has.
            state.queue.delete(id);
            if (create) state.refused.add(id);
            writeStored(latest.current.storage, state);
            if (result.reason !== 'invalid') needPull = true;
            fail(result.reason);
            softFailure = true;
            break;
          }
          fail(result.reason);
          // Only a network or server outage stops the queue. Anything else is about this person
          // alone: keep their edits, note the error and carry on with the next one.
          if (result.reason === 'offline' || result.reason === 'unavailable') return false;
          softFailure = true;
          break;
        }
      }
      return true;
    };

    const cycle = async (): Promise<void> => {
      if (running) {
        again = true;
        return;
      }
      running = true;
      try {
        do {
          again = false;
          const accessToken = await token();
          if (!alive) break;
          let ok = accessToken !== null;
          if (!ok) fail('signed_out'); // no token yet: back off and ask again
          softFailure = false;
          if (accessToken && needPull) {
            const pulled = await pull(accessToken);
            if (pulled) needPull = false;
            else ok = false;
          }
          if (alive && ok && accessToken) ok = await flush(accessToken);
          // A 403/404 asks for a pull straight away.
          if (alive && ok && needPull && accessToken) {
            if (await pull(accessToken)) needPull = false;
            else ok = false;
          }
          if (!alive) break;
          if (ok) {
            failures = 0;
            if (!softFailure) fail(null);
          } else {
            failures += 1;
            const delay = Math.min(BACKOFF_START_MS * 2 ** (failures - 1), BACKOFF_MAX_MS);
            arm(delay);
            break;
          }
        } while (again);
      } catch {
        // Never thrown to the app (C5). The next wake or timer tries again.
      } finally {
        running = false;
      }
    };

    // (Re)starts the one timer that runs the next cycle, so a later edit or wake replaces a backoff wait.
    function arm(delayMs: number): void {
      if (timer !== undefined) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = undefined;
        void cycle();
      }, delayMs);
    }

    kickRef.current = arm;
    let unsubscribe: () => void = () => undefined;
    try {
      unsubscribe = latest.current.subscribe(() => {
        failures = 0;
        needPull = true;
        arm(0);
      });
    } catch {
      // No wake source: the timers still run.
    }
    const interval = setInterval(() => {
      needPull = true;
      void cycle();
    }, PULL_INTERVAL_MS);
    void cycle();
    // Edits that were noticed before this effect ran still need sending.
    if (getState().queue.size > 0) arm(EDIT_DEBOUNCE_MS);

    return () => {
      alive = false;
      kickRef.current = () => undefined;
      if (timer !== undefined) clearTimeout(timer);
      clearInterval(interval);
      // Abort every request still in flight; `alive` is false, so their results are ignored.
      for (const cancel of [...inFlight]) cancel();
      try {
        unsubscribe();
      } catch {
        // ignore
      }
    };
  }, [active, userId]);

  return { lastError };
}

function markKnown(state: SyncState, flows: readonly FlowRecord[], userId: string): void {
  for (const record of flows) if (record.ownerId === userId) state.known.add(record.id);
}
