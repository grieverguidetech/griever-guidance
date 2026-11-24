import { useCallback, useEffect, useRef, useState } from 'react';
import { createFlow, listFlows, parseSyncedPatch, patchFlow } from '@griever/api-client';
import type {
  FlowsFailureReason,
  ListFlowsResult,
  PatchFlowResult,
  WriteFlowResult,
} from '@griever/api-client';
import { FLOW_FACT_KEYS, isUuid, SYNCED_KEYS, toFlowDetails, toSyncedFields, withServicePair } from '@griever/shared';
import type { FlowRecord, SyncedFields, SyncedKey } from '@griever/shared';
import type { SendFlowStorage } from './useSendFlow.js';
import { generateFlowId, readRemovedFlows, writeRemovedFlows } from './useSessions.js';
import type { Session, UseSessionsResult } from './useSessions.js';

/** The api-client functions the hook uses. Tests pass a stub; the default is the real module. */
export interface FlowSyncClient {
  listFlows: (accessToken: string, signal?: AbortSignal) => Promise<ListFlowsResult>;
  createFlow: (accessToken: string, id: string, fields: SyncedFields, signal?: AbortSignal) => Promise<WriteFlowResult>;
  patchFlow: (
    accessToken: string,
    id: string,
    partial: Partial<SyncedFields>,
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
  /** Gives a person a new flowId when their old one was taken on the server (#942). */
  moveFlowId: UseSessionsResult['moveFlowId'];
  client?: FlowSyncClient;
}

/** For tests only. Nothing in the UI reads it (C5: no visible sync state). */
export interface UseFlowSyncResult {
  lastError: FlowsFailureReason | null;
  /** True once the first pull of this sign-in has been applied. The editor's landing waits for it, briefly. */
  pulled: boolean;
  /**
   * Asks the server for the latest now, for a pull to refresh. Resolves true once the answer is applied
   * (the same path as an automatic pull), false when it could not be loaded. Never rejects. False when sync is off.
   */
  pullNow: () => Promise<boolean>;
  /** Counts the pulls applied since sign-in, so a screen can drop a "could not load" line when one works. */
  pullCount: number;
  /**
   * Sends the saved queue now, without the 1 second edit wait. For the phone going to the background.
   * Does nothing when sync is off or nothing is queued. After a 429 it still waits for the backoff.
   */
  flushNow: () => void;
}

export const FLOW_QUEUE_STORAGE_KEY = 'gg.flowQueue.v1';
/** One record per account, so signing in as someone else and back keeps the first queue. */
export const flowQueueKey = (userId: string): string => `${FLOW_QUEUE_STORAGE_KEY}:${userId}`;
export const BACKOFF_START_MS = 5_000;
export const BACKOFF_MAX_MS = 300_000;
export const PULL_INTERVAL_MS = 600_000;
export const EDIT_DEBOUNCE_MS = 1_000;
export const REQUEST_TIMEOUT_MS = 15_000;

type Pending = Partial<SyncedFields>;

/** Only the keys whose value differs, taken from `after`. Facts and details alike. */
function diffSynced(before: SyncedFields, after: SyncedFields): Pending {
  const out: Record<string, unknown> = {};
  for (const key of SYNCED_KEYS) {
    if (before[key] !== after[key]) {
      out[key] = after[key];
    }
  }
  return out as Pending;
}

/** Several queued edits become one patch with the latest value per key (later wins). */
function coalesce(patches: readonly Pending[]): Pending {
  return Object.assign({}, ...patches) as Pending;
}

/**
 * A saved baseline. One saved before details synced holds only the facts: its detail keys are
 * filled with the empty values, so details already typed on this device are found as edits.
 * The same holds for the 37 check keys (#1080): a baseline saved before then has none, so they
 * read as open, ticks made earlier diff as edits and are queued before the first pull is merged.
 * Without this the server's null for every unwritten check key would clear those ticks.
 */
function readBaseline(input: unknown): SyncedFields | null {
  const parsed = parseSyncedPatch(input);
  if (!parsed) {
    return null;
  }
  const hasFacts = FLOW_FACT_KEYS.every((key) => key in parsed);
  if (!hasFacts) {
    return null;
  }
  return { ...toFlowDetails({}), ...parsed } as SyncedFields;
}

interface Stored {
  queue: Record<string, Pending>;
  /** Flows the server is known to have, so the next write is a PATCH. */
  known: string[];
  /** The facts and details last seen per person, so edits made while sync was off are still found. */
  baselines: Record<string, SyncedFields>;
  /** Flows marked known only because a create got `taken`, and not yet written to (#942). */
  conflicted?: string[];
  /** Old flowId to new, for people given a new id and not yet seen holding it (#942). */
  moved?: Record<string, string>;
  /** Ids made by a re-mint. One of these is never re-minted again (#942). */
  reminted?: string[];
}

interface SyncState {
  userId: string;
  queue: Map<string, Pending>;
  known: Set<string>;
  /** The facts and details last seen per flow, to tell what the user changed. Saved in storage. */
  baselines: Map<string, SyncedFields>;
  /** True once a pull has worked this run: only then do we know which people the server lacks. */
  pulled: boolean;
  /** People the server refused to create; not offered again this run. */
  refused: Set<string>;
  /**
   * Known only because a create got `taken` (another account holds the id). If the PATCH that follows
   * gets 404, the person gets a new id (#942). A plain `conflict` (the caller's own id) never lands
   * here. Cleared by the first write that works. Saved in storage.
   */
  conflicted: Set<string>;
  /**
   * Old flowId to new, for people given a new id. A session may still hold the old one: until React
   * re-renders, or after a restart whose sessions save was lost. Saved; an entry goes once a session
   * holds the new id and none holds the old.
   */
  moved: Map<string, string>;
  /** Ids a re-mint made. Never re-minted again, so a run of `taken` answers cannot loop. Saved. */
  reminted: Set<string>;
  /** Old ids this run has already asked useSessions to move. Not saved: a restart asks again. */
  moveAsked: Set<string>;
}

function readStored(storage: SendFlowStorage | undefined, userId: string): SyncState {
  const state: SyncState = {
    userId,
    queue: new Map(),
    known: new Set(),
    baselines: new Map(),
    pulled: false,
    refused: new Set(),
    conflicted: new Set(),
    moved: new Map(),
    reminted: new Set(),
    moveAsked: new Set(),
  };
  if (!storage) return state;
  try {
    const raw = storage.getItem(flowQueueKey(userId));
    if (!raw) return state;
    const parsed = JSON.parse(raw) as Partial<Stored> | null;
    if (!parsed) return state;
    for (const [id, pending] of Object.entries(parsed.queue ?? {})) {
      const clean = isUuid(id) ? parseSyncedPatch(pending) : null;
      if (clean && Object.keys(clean).length > 0) state.queue.set(id, clean);
    }
    for (const [id, facts] of Object.entries(parsed.baselines ?? {})) {
      const clean = isUuid(id) ? readBaseline(facts) : null;
      if (clean) state.baselines.set(id, clean);
    }
    for (const id of parsed.known ?? []) if (typeof id === 'string' && isUuid(id)) state.known.add(id);
    for (const id of parsed.conflicted ?? []) {
      if (typeof id === 'string' && isUuid(id) && state.known.has(id)) {
        state.conflicted.add(id);
      }
    }
    for (const [oldId, newId] of Object.entries(parsed.moved ?? {})) {
      if (isUuid(oldId) && typeof newId === 'string' && isUuid(newId)) {
        state.moved.set(oldId, newId);
      }
    }
    for (const id of parsed.reminted ?? []) {
      if (typeof id === 'string' && isUuid(id)) {
        state.reminted.add(id);
      }
    }
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
      conflicted: [...state.conflicted],
      moved: Object.fromEntries(state.moved),
      reminted: [...state.reminted],
    };
    storage.setItem(flowQueueKey(state.userId), JSON.stringify(stored));
  } catch {
    // storage unavailable: the queue still works for this run
  }
}

/** Only an owner session (made here or by this account) may be created on the server. */
const mayCreate = (s: Session, userId: string): boolean =>
  s.role === 'owner' && (s.ownerId === null || s.ownerId === userId) && (!s.heldFor || s.heldFor === userId);

/** Someone else's account's person on this device is never sent. Keep in step with `isPrevious` in useSessions. */
const isMine = (s: Session, userId: string): boolean =>
  s.role === 'member' || s.ownerId === null || s.ownerId === userId;

/** The id sync uses for a session: its new one if it was given one this run and the session does not show it yet. */
function flowIdOf(state: SyncState, s: Pick<Session, 'flowId'>): string {
  let id = s.flowId;
  for (let next = state.moved.get(id); next !== undefined; next = state.moved.get(id)) {
    id = next;
  }
  return id;
}

/**
 * Moves a person whose flowId someone else took on the server to a new id (#942). The old id leaves the
 * queue, `known` and the baselines; the new one is queued with all the person's current facts and
 * details, so the create that follows loses no edit. Returns the new id.
 */
function remint(state: SyncState, oldId: string, session: Session): string {
  const newId = generateFlowId();
  const baseline = state.baselines.get(oldId);
  state.queue.delete(oldId);
  state.known.delete(oldId);
  state.conflicted.delete(oldId);
  state.refused.delete(oldId);
  state.baselines.delete(oldId);
  if (baseline) {
    state.baselines.set(newId, baseline);
  }
  state.queue.set(newId, toSyncedFields(session));
  state.moved.set(oldId, newId);
  state.reminted.add(newId);
  return newId;
}

/**
 * The moves useSessions still has to make: a session holding an old id is asked to take the new one
 * once per run, so a restart whose sessions save was lost does not leave the person on the old id
 * (the next pull would then add the new id as a second person). An entry is dropped once a session
 * holds the new id and none holds the old one. `dirty` is true when an entry was dropped.
 */
function pendingMoves(state: SyncState, sessions: readonly Session[]): { moves: Array<[string, string]>; dirty: boolean } {
  const held = new Set(sessions.map((s) => s.flowId));
  const moves: Array<[string, string]> = [];
  let dirty = false;
  for (const [oldId, newId] of [...state.moved]) {
    if (!held.has(oldId)) {
      if (held.has(newId)) {
        state.moved.delete(oldId);
        state.moveAsked.delete(oldId);
        dirty = true;
      }
      continue;
    }
    if (!state.moveAsked.has(oldId)) {
      state.moveAsked.add(oldId);
      moves.push([oldId, flowIdOf(state, { flowId: oldId })]);
    }
  }
  return { moves, dirty };
}

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
  const present = new Set(sessions.map((s) => flowIdOf(state, s)));
  for (const s of sessions) {
    if (!isMine(s, userId)) continue;
    const flowId = flowIdOf(state, s);
    seen.add(flowId);
    const facts = toSyncedFields(s);
    const before = state.baselines.get(flowId);
    state.baselines.set(flowId, facts);
    const diff = before ? diffSynced(before, facts) : {};
    if (!before || Object.keys(diff).length > 0) dirty = true;
    const unsent =
      state.pulled &&
      mayCreate(s, userId) &&
      !state.known.has(flowId) &&
      !state.refused.has(flowId) &&
      !state.queue.has(flowId) &&
      facts.personName !== '';
    if (unsent) {
      state.queue.set(flowId, { ...facts });
      changed = true;
    } else if (Object.keys(diff).length > 0) {
      state.queue.set(flowId, coalesce([state.queue.get(flowId) ?? {}, diff]));
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
  for (const ids of [state.conflicted, state.reminted]) {
    for (const id of [...ids]) {
      if (!seen.has(id)) {
        ids.delete(id);
        dirty = true;
      }
    }
  }
  return { queue: changed, dirty: dirty || changed };
}

const offline = { ok: false, reason: 'offline' } as const;

/**
 * Sends edits to a person's facts and details (SYNCED_KEYS) in the background (DS-6, DS-7). The device stays the source of
 * truth: edits are queued per flow, coalesced, and sent as POST (a person the server hasn't seen)
 * or PATCH (only the pending keys). Nothing on screen waits for this (C5). Failures are kept in
 * the queue and retried; nothing is thrown and no state is shown.
 */
export function useFlowSync(options: UseFlowSyncOptions): UseFlowSyncResult {
  const [lastError, setLastError] = useState<FlowsFailureReason | null>(null);
  const [pulledFor, setPulledFor] = useState<string | null>(null);
  const [pullCount, setPullCount] = useState(0);
  const latest = useRef(options);
  latest.current = options;
  const stateRef = useRef<SyncState | null>(null);
  // Set by the effect below; lets the sessions effect ask for a flush.
  const kickRef = useRef<(delayMs: number) => void>(() => undefined);
  // Set by the effect below; runs one pull for the caller and says whether it worked.
  const pullNowRef = useRef<() => Promise<boolean>>(async () => false);
  const pullNow = useCallback(() => pullNowRef.current(), []);
  const flushNow = useCallback(() => {
    if ((stateRef.current?.queue.size ?? 0) > 0) {
      kickRef.current(0);
    }
  }, []);

  const { enabled, userId, sessions } = options;
  const active = enabled && userId !== '';

  // A new sign-in starts without a pull.
  useEffect(() => {
    if (!active) {
      setPulledFor(null);
    }
  }, [active]);

  // Notice edits. Runs after every sessions change.
  useEffect(() => {
    if (!active) return;
    const { storage } = latest.current;
    if (stateRef.current?.userId !== userId) stateRef.current = readStored(storage, userId);
    const state = stateRef.current;
    try {
      const { queue, dirty } = scanSessions(state, sessions, userId, new Set((readRemovedFlows(storage) ?? []).map((m) => m.id)));
      const moved = pendingMoves(state, sessions);
      if (dirty || moved.dirty) {
        writeStored(storage, state);
      }
      // Runs before the sync effect's first pull, so a person still on an old id is moved first (#942).
      for (const [oldId, newId] of moved.moves) {
        latest.current.moveFlowId(oldId, newId);
      }
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
    // Bumped by each request for a pull (a wake). See pull(): an answer to an older request is not used.
    let pullAsks = 0;
    // Each request gets a number. Two pulls can be out at once (a cycle and a pull to refresh); an answer older
    // than one already applied is dropped, so the older data never lands last.
    let pullSeq = 0;
    let appliedSeq = 0;
    let failures = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const inFlight = new Set<Cancel>();
    let softFailure = false;
    // True while the last write got a 429. Edits then must not replace the backoff timer.
    let rateLimited = false;
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

    /**
     * 'done' once the answer is applied. 'stale' when a pull was asked for while this one was out: the
     * answer may be older than the reason for asking (a leave, #223), so it is not applied at all and
     * the cycle pulls again. 'failed' backs off.
     */
    const pull = async (accessToken: string): Promise<'done' | 'stale' | 'failed'> => {
      const asked = pullAsks;
      const seq = ++pullSeq;
      const result = await withTimeout((signal) => client().listFlows(accessToken, signal), offline, inFlight);
      if (!alive) return 'failed';
      if (!result.ok) {
        fail(result.reason);
        return 'failed';
      }
      if (asked !== pullAsks) {
        return 'stale';
      }
      if (seq < appliedSeq) {
        return 'done';
      }
      appliedSeq = seq;
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
      const pendingByFlow: Record<string, SyncedKey[]> = {};
      for (const [id, pending] of state.queue) {
        pendingByFlow[id] = SYNCED_KEYS.filter((key) => key in pending);
      }
      // Records already merged into sessions must not look like local edits afterwards.
      for (const record of flows) {
        const base = state.baselines.get(record.id);
        if (!base) continue;
        // The same pair widening as the merge, so baselines match what the merge wrote.
        const pendingKeys = withServicePair(pendingByFlow[record.id] ?? []);
        const remote: Partial<SyncedFields> = { ...record.facts, ...record.details };
        const next: Record<string, unknown> = { ...base };
        for (const key of SYNCED_KEYS) {
          if (!pendingKeys.has(key) && remote[key] !== undefined) {
            next[key] = remote[key];
          }
        }
        state.baselines.set(record.id, next as unknown as SyncedFields);
      }
      writeStored(latest.current.storage, state);
      latest.current.applyRemoteFlows({ flows, dropped: result.dropped }, userId, pendingByFlow);
      setPulledFor(userId);
      setPullCount((count) => count + 1);
      return 'done';
    };

    /** Sends every queued flow. Returns false when a retryable failure means "stop and back off". */
    const flush = async (accessToken: string): Promise<boolean> => {
      const state = getState();
      softFailure = false;
      // A person given a new id (#942) is added to the end, so they are created in this same flush.
      const ids = [...state.queue.keys()];
      for (let i = 0; i < ids.length; i++) {
        const id = ids[i];
        for (;;) {
          if (!alive) return true;
          const pending = state.queue.get(id);
          const session = latest.current.sessions.find((s) => flowIdOf(state, s) === id);
          if (!pending || !session || !isMine(session, userId)) {
            state.queue.delete(id);
            break;
          }
          const create = mayCreate(session, userId) && !state.known.has(id);
          const sent: Pending = create ? toSyncedFields(session) : { ...pending };
          const result = await withTimeout<WriteFlowResult | PatchFlowResult>(
            (signal) =>
              create
                ? client().createFlow(accessToken, id, sent as SyncedFields, signal)
                : client().patchFlow(accessToken, id, sent, signal),
            offline,
            inFlight,
          );
          if (!alive) return true;
          if (result.ok) {
            state.known.add(id);
            state.conflicted.delete(id);
            const now = state.queue.get(id) ?? {};
            // Keep only what changed while the request was in flight.
            const left: Record<string, unknown> = {};
            for (const key of SYNCED_KEYS) {
              if (key in now && now[key] !== sent[key]) left[key] = now[key];
            }
            if (Object.keys(left).length > 0) state.queue.set(id, left as Pending);
            else state.queue.delete(id);
            writeStored(latest.current.storage, state);
            break;
          }
          if ((result.reason === 'conflict' || result.reason === 'taken') && create) {
            state.known.add(id); // the server has it already: edit it instead
            if (result.reason === 'taken') {
              // Another account holds this id. If the PATCH gets 404 too, the person moves (below).
              state.conflicted.add(id);
              writeStored(latest.current.storage, state);
            }
            continue;
          }
          // `taken` on create, then 404 on the PATCH: the id is someone else's flow (#942). An owner's
          // person moves to a new id and is created again with everything. A plain 404 (a deleted flow,
          // lost access, or the caller's own deleted id, which answers `conflict`) never gets here. An
          // id a re-mint made is never re-minted: it falls through to drop-and-pull.
          if (
            result.reason === 'not_found' &&
            !create &&
            state.conflicted.has(id) &&
            !state.reminted.has(id) &&
            mayCreate(session, userId)
          ) {
            const newId = remint(state, id, session);
            ids.push(newId);
            writeStored(latest.current.storage, state);
            state.moveAsked.add(id);
            latest.current.moveFlowId(id, newId);
            break;
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
          rateLimited = result.reason === 'rate_limited';
          // A network or server outage, or the gateway's write limit (429), stops the queue: the edits
          // stay queued and the next cycle retries. Anything else is about this person alone: keep
          // their edits, note the error and carry on with the next one.
          if (result.reason === 'offline' || result.reason === 'unavailable' || result.reason === 'rate_limited') {
            return false;
          }
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
            if (pulled === 'done') needPull = false;
            else if (pulled === 'failed') ok = false;
          }
          if (alive && ok && accessToken) ok = await flush(accessToken);
          // A 403/404 asks for a pull straight away.
          if (alive && ok && needPull && accessToken) {
            const pulled = await pull(accessToken);
            if (pulled === 'done') needPull = false;
            else if (pulled === 'failed') ok = false;
          }
          if (!alive) break;
          if (ok) {
            failures = 0;
            rateLimited = false;
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

    // An edit normally runs the next cycle soon. After a 429 it waits for the backoff already armed,
    // so typing does not cause one more 429 per pause.
    kickRef.current = (delayMs: number) => {
      if (rateLimited && timer !== undefined) {
        return;
      }
      arm(delayMs);
    };
    // A manual pull. It does not wait for a running cycle; the answer goes through the same pull() and apply path.
    // 'stale' (a wake asked while it was out) is tried once more, then counted as failed.
    pullNowRef.current = async () => {
      try {
        for (let attempt = 0; attempt < 2; attempt++) {
          const accessToken = await token();
          if (!alive) {
            return false;
          }
          if (!accessToken) {
            fail('signed_out');
            return false;
          }
          const pulled = await pull(accessToken);
          if (pulled === 'done') {
            needPull = false;
            failures = 0;
            fail(null);
            return true;
          }
          if (pulled === 'failed') {
            return false;
          }
        }
        // Asked again while this one was out: the cycle that wake queued pulls the newer answer.
        return true;
      } catch {
        // Never thrown to the app.
      }
      return false;
    };
    let unsubscribe: () => void = () => undefined;
    try {
      unsubscribe = latest.current.subscribe(() => {
        failures = 0;
        needPull = true;
        pullAsks += 1;
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
      pullNowRef.current = async () => false;
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

  return { lastError, pulled: active && pulledFor === userId, pullNow, pullCount, flushNow };
}

function markKnown(state: SyncState, flows: readonly FlowRecord[], userId: string): void {
  for (const record of flows) if (record.ownerId === userId) state.known.add(record.id);
}
