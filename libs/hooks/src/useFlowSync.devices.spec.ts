import { act, renderHook } from '@testing-library/react';
import {
  CHECKLIST_FLOW_KEYS,
  SYNCED_KEYS,
  splitSyncedPatch,
  toFlowDetails,
  toSyncedFields,
} from '@griever/shared';
import type { FlowDetails, FlowFacts, FlowRecord, SyncedFields } from '@griever/shared';
import type { FlowSyncClient } from './useFlowSync.js';
import { EDIT_DEBOUNCE_MS, flowQueueKey, useFlowSync } from './useFlowSync.js';
import type { SendFlowStorage } from './useSendFlow.js';
import { useSessions } from './useSessions.js';

const USER = 'user_me';
const FLOW = '44444444-4444-4444-8444-444444444444';

type Write = { method: 'POST' | 'PATCH'; body: Record<string, unknown> };

/** The facts and the details of a flat set of synced fields, typed the way a record holds them. */
function split(input: unknown): { facts: FlowFacts; details: FlowDetails } {
  return splitSyncedPatch(input) as unknown as { facts: FlowFacts; details: FlowDetails };
}

/** One in-memory server that both devices talk to. It keeps what each write stored. */
function fakeServer() {
  const records = new Map<string, { facts: FlowFacts; details: FlowDetails }>();
  const writes: Write[] = [];
  const asRecord = (id: string): FlowRecord => {
    const stored = records.get(id) as { facts: FlowFacts; details: FlowDetails };
    return {
      id,
      ownerId: USER,
      role: 'owner',
      facts: stored.facts,
      details: stored.details,
      updatedAt: '2026-11-24T00:00:00.000Z',
      updatedBy: USER,
    };
  };
  const client: FlowSyncClient = {
    listFlows: async () => ({ ok: true, flows: [...records.keys()].map(asRecord), dropped: 0 }),
    createFlow: async (_token, id, fields) => {
      writes.push({ method: 'POST', body: { ...fields } });
      const parts = split(fields);
      records.set(id, { facts: { ...parts.facts }, details: { ...parts.details } });
      return { ok: true, flow: asRecord(id) };
    },
    patchFlow: async (_token, id, partial) => {
      writes.push({ method: 'PATCH', body: { ...partial } });
      const stored = records.get(id);
      if (!stored) {
        return { ok: false, reason: 'not_found' };
      }
      const parts = split(partial);
      stored.facts = { ...stored.facts, ...parts.facts };
      stored.details = { ...stored.details, ...parts.details };
      return { ok: true, flow: asRecord(id) };
    },
  };
  return { client, records, writes, asRecord };
}

function memoryStorage(initial: Record<string, string> = {}): SendFlowStorage {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

/** One device: its own storage, its own sessions, the shared server. `blockWrites` makes writes fail offline. */
function device(server: ReturnType<typeof fakeServer>, storage: SendFlowStorage = memoryStorage()) {
  const wakes = new Set<() => void>();
  const control = { blockWrites: false };
  const client: FlowSyncClient = {
    listFlows: server.client.listFlows,
    createFlow: (...args) =>
      control.blockWrites ? Promise.resolve({ ok: false, reason: 'offline' }) : server.client.createFlow(...args),
    patchFlow: (...args) =>
      control.blockWrites ? Promise.resolve({ ok: false, reason: 'offline' }) : server.client.patchFlow(...args),
  };
  const view = renderHook(() => {
    const sessions = useSessions(storage);
    useFlowSync({
      sessions: sessions.sessions,
      userId: USER,
      getAccessToken: async () => 'tok',
      enabled: true,
      storage,
      subscribe: (fn) => {
        wakes.add(fn);
        return () => void wakes.delete(fn);
      },
      applyRemoteFlows: sessions.applyRemoteFlows,
      moveFlowId: sessions.moveFlowId,
      client,
    });
    return sessions;
  });
  return {
    control,
    get sessions() {
      return view.result.current.sessions;
    },
    api: () => view.result.current,
    wake: () => act(() => wakes.forEach((fn) => fn())),
    unmount: view.unmount,
  };
}

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

/** Lets the debounced write go out, then lets the other device ask again. */
async function settle(...devices: Array<ReturnType<typeof device>>) {
  await advance(EDIT_DEBOUNCE_MS + 10);
  for (const d of devices) {
    await d.wake();
    await advance(10);
  }
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('two devices share the phase checklist ticks (#1080)', () => {
  async function twoDevices() {
    const server = fakeServer();
    const a = device(server);
    await advance(10);
    act(() => {
      a.api().createSession({ personName: 'Margaret Hayes' });
    });
    await settle(a);
    const b = device(server);
    await advance(10);
    expect(b.sessions).toHaveLength(1);
    return { server, a, b };
  }

  it('A ticks X, B ticks Y: after both sync, both have X and Y', async () => {
    const { a, b } = await twoDevices();
    act(() => a.api().setChecklistItem(a.sessions[0].id, 'custody', 'done'));
    await settle(b);
    expect(b.sessions[0].checklist).toEqual({ custody: 'done' });
    act(() => b.api().setChecklistItem(b.sessions[0].id, 'eulogy', 'not_applicable'));
    await settle(a);
    expect(a.sessions[0].checklist).toEqual({ custody: 'done', eulogy: 'not_applicable' });
    expect(b.sessions[0].checklist).toEqual({ custody: 'done', eulogy: 'not_applicable' });
  });

  it('A and B tick different items before either syncs: nothing is lost', async () => {
    const { a, b } = await twoDevices();
    act(() => a.api().setChecklistItem(a.sessions[0].id, 'custody', 'done'));
    act(() => b.api().setChecklistItem(b.sessions[0].id, 'eulogy', 'done'));
    await settle(a, b);
    await settle(a, b);
    expect(a.sessions[0].checklist).toEqual({ custody: 'done', eulogy: 'done' });
    expect(b.sessions[0].checklist).toEqual({ custody: 'done', eulogy: 'done' });
  });

  it('A un-ticks X: B clears X and keeps its other ticks', async () => {
    const { a, b } = await twoDevices();
    act(() => a.api().setChecklistItem(a.sessions[0].id, 'custody', 'done'));
    act(() => a.api().setChecklistItem(a.sessions[0].id, 'eulogy', 'done'));
    await settle(b);
    expect(b.sessions[0].checklist).toEqual({ custody: 'done', eulogy: 'done' });
    act(() => a.api().setChecklistItem(a.sessions[0].id, 'custody', null));
    await settle(b);
    expect(b.sessions[0].checklist).toEqual({ eulogy: 'done' });
  });

  it('an unsent edit on B survives a pull, and goes out once B is online', async () => {
    const { server, a, b } = await twoDevices();
    b.control.blockWrites = true;
    act(() => b.api().setChecklistItem(b.sessions[0].id, 'reception', 'done'));
    act(() => a.api().setChecklistItem(a.sessions[0].id, 'custody', 'done'));
    await settle(b);
    // The pull brought A's tick in and did not wipe B's unsent one.
    expect(b.sessions[0].checklist).toEqual({ custody: 'done', reception: 'done' });
    b.control.blockWrites = false;
    await b.wake();
    await advance(10);
    await settle(a);
    expect(server.asRecord(FLOW_OF(server)).details?.checkReception).toBe('done');
    expect(a.sessions[0].checklist).toEqual({ custody: 'done', reception: 'done' });
  });

  it('sends only whitelisted keys: never the Gather ticks or a checklist object', async () => {
    const { server, a } = await twoDevices();
    act(() => a.api().setChecklistItem(a.sessions[0].id, 'custody', 'done'));
    await settle(a);
    expect(server.writes.length).toBeGreaterThan(0);
    for (const write of server.writes) {
      for (const key of Object.keys(write.body)) {
        expect([...SYNCED_KEYS, 'id']).toContain(key);
      }
      expect(write.body).not.toHaveProperty('checklist');
      expect(write.body).not.toHaveProperty('checklistTicks');
    }
    // The create carries all 37 keys; the later PATCH carries only the one that changed.
    expect(CHECKLIST_FLOW_KEYS.every((key) => key in server.writes[0].body)).toBe(true);
    expect(server.writes[server.writes.length - 1]).toEqual({ method: 'PATCH', body: { checkCustody: 'done' } });
  });
});

function FLOW_OF(server: ReturnType<typeof fakeServer>): string {
  return [...server.records.keys()][0];
}

describe('the first pull after #1080 keeps ticks made before it', () => {
  const ticks = { custody: 'done', eulogy: 'not_applicable' } as const;

  const storedSession = () => ({
    id: 'local-1',
    flowId: FLOW,
    ownerId: USER,
    role: 'owner',
    personName: 'Margaret Hayes',
    dateOfPassing: '',
    senderName: '',
    obituaryUrl: '',
    serviceReady: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    lastOpenedAt: '2026-01-01T00:00:00.000Z',
    drafts: {},
    recipientsNotified: {},
    momentCompletedAt: {},
    remindersScheduled: [],
    checklist: ticks,
  });

  /** A baseline written by a build before #1080: no check keys at all. */
  const oldBaseline = (factsOnly: boolean): Record<string, unknown> => {
    const without = toSyncedFields({ personName: 'Margaret Hayes' }) as unknown as Record<string, unknown>;
    const kept: Record<string, unknown> = {};
    const factKeys = ['personName', 'dateOfPassing', 'serviceDate', 'obituaryUrl', 'obituaryPublisher', 'serviceReady'];
    for (const [key, value] of Object.entries(without)) {
      if (CHECKLIST_FLOW_KEYS.some((check) => check === key)) {
        continue;
      }
      if (factsOnly && !factKeys.includes(key)) {
        continue;
      }
      kept[key] = value;
    }
    return kept;
  };

  it.each([
    ['a baseline with the details but no check keys', false],
    ['a baseline with the facts only', true],
  ])('%s: ticks stay and are queued for the push', async (_name, factsOnly) => {
    const server = fakeServer();
    // The server has the person and, as before #1080, null for every check key.
    const empty = split(toSyncedFields({ personName: 'Margaret Hayes' }));
    server.records.set(FLOW, { facts: empty.facts, details: empty.details });
    for (const key of CHECKLIST_FLOW_KEYS) {
      expect(server.records.get(FLOW)?.details[key]).toBeNull();
    }
    const storage = memoryStorage({
      'gg.sessions.v1': JSON.stringify([storedSession()]),
      [flowQueueKey(USER)]: JSON.stringify({
        queue: {},
        known: [FLOW],
        baselines: { [FLOW]: oldBaseline(factsOnly) },
      }),
    });
    const d = device(server, storage);
    await advance(10);
    // The pull did not wipe the ticks.
    expect(d.sessions[0].checklist).toEqual(ticks);
    await advance(EDIT_DEBOUNCE_MS + 10);
    // They were pushed: one PATCH with just the two ticks.
    expect(server.writes.filter((w) => w.method === 'PATCH').map((w) => w.body)).toContainEqual({
      checkCustody: 'done',
      checkEulogy: 'not_applicable',
    });
    const stored = server.records.get(FLOW)?.details as unknown as SyncedFields;
    expect(stored.checkCustody).toBe('done');
    expect(stored.checkEulogy).toBe('not_applicable');
    expect(d.sessions[0].checklist).toEqual(ticks);
  });

  it('a record from an older server with no check keys at all leaves the ticks alone', async () => {
    const server = fakeServer();
    const empty = split(toSyncedFields({ personName: 'Margaret Hayes' }));
    for (const key of CHECKLIST_FLOW_KEYS) {
      delete empty.details[key];
    }
    server.records.set(FLOW, { facts: empty.facts, details: empty.details });
    const storage = memoryStorage({ 'gg.sessions.v1': JSON.stringify([storedSession()]) });
    const d = device(server, storage);
    await advance(10);
    expect(d.sessions[0].checklist).toEqual(ticks);
    expect(toFlowDetails({ checklist: ticks }).checkCustody).toBe('done');
  });
});
