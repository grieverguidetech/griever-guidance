import { act, renderHook } from '@testing-library/react';
import type { FlowRecord, SyncedFields } from '@griever/shared';
import { EDIT_DEBOUNCE_MS, flowQueueKey, useFlowSync } from './useFlowSync.js';
import type { FlowSyncClient } from './useFlowSync.js';
import { useSessions } from './useSessions.js';

// A person deleted on one device leaves the owner's other devices only when the server names the id as
// removed (#1084). Absence never removes anyone.

const USER = 'user_me';
const OTHER = 'user_other';
const FLOW = '33333333-3333-4333-8333-333333333333';
const OLD = '44444444-4444-4444-8444-444444444444';

const ownerOf = (token: string): string => token.slice('tok-'.length);

/** One server shared by every device. The token names the account. */
function fakeServer() {
  const flows = new Map<string, FlowRecord>();
  const removedIds = new Set<string>();
  const calls = { list: 0, create: 0, patch: 0 };
  const server = {
    flows,
    calls,
    listOffline: false,
    createOffline: false,
    patchOffline: false,
    /** Deleted on web: off the list, named in `removed`, and a create for the id gets `conflict` like the real server. */
    remove: (id: string) => {
      flows.delete(id);
      removedIds.add(id);
    },
    /** Names an id as removed without having had a flow. */
    nameRemoved: (id: string) => removedIds.add(id),
  };
  const toRecord = (id: string, ownerId: string, fields: Partial<SyncedFields>): FlowRecord => ({
    id,
    ownerId,
    role: 'owner',
    facts: {
      personName: fields.personName ?? '',
      dateOfPassing: null,
      serviceDate: null,
      obituaryUrl: null,
      obituaryPublisher: null,
      serviceReady: false,
    },
    updatedAt: '2026-10-01T00:00:00.000Z',
    updatedBy: null,
  });
  const client: FlowSyncClient = {
    listFlows: async (token) => {
      calls.list += 1;
      if (server.listOffline) {
        return { ok: false, reason: 'offline' };
      }
      return {
        ok: true,
        flows: [...flows.values()].filter((r) => r.ownerId === ownerOf(token)),
        dropped: 0,
        removed: [...removedIds],
      };
    },
    createFlow: async (token, id, fields) => {
      calls.create += 1;
      if (server.createOffline) {
        return { ok: false, reason: 'offline' };
      }
      if (removedIds.has(id)) {
        return { ok: false, reason: 'conflict' };
      }
      const record = toRecord(id, ownerOf(token), fields);
      flows.set(id, record);
      return { ok: true, flow: record };
    },
    patchFlow: async (token, id, partial) => {
      calls.patch += 1;
      if (server.patchOffline) {
        return { ok: false, reason: 'offline' };
      }
      const found = flows.get(id);
      if (!found) {
        return { ok: false, reason: 'not_found' };
      }
      const record = toRecord(id, ownerOf(token), { personName: found.facts.personName, ...partial });
      flows.set(id, record);
      return { ok: true, flow: record };
    },
  };
  return { server, client };
}

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  };
}

const sessionRecord = (flowId: string, over: object = {}) => ({
  id: `local-${flowId.slice(0, 4)}`,
  flowId,
  ownerId: USER,
  role: 'owner',
  personName: 'Margaret Hayes',
  createdAt: '2026-01-01T00:00:00.000Z',
  lastOpenedAt: '2026-01-01T00:00:00.000Z',
  drafts: {},
  recipientsNotified: {},
  momentCompletedAt: {},
  remindersScheduled: [],
  ...over,
});

/** One phone or browser: its own storage, the real useSessions and the real useFlowSync. */
function device(client: FlowSyncClient, opts: { sessions?: object[]; sync?: object } = {}) {
  const storage = memoryStorage();
  if (opts.sessions) {
    storage.data.set('gg.sessions.v1', JSON.stringify(opts.sessions));
  }
  if (opts.sync) {
    storage.data.set(flowQueueKey(USER), JSON.stringify(opts.sync));
  }
  const wakes = new Set<() => void>();
  const view = renderHook(
    () => {
      const sessions = useSessions(storage);
      useFlowSync({
        sessions: sessions.sessions,
        userId: USER,
        getAccessToken: async () => `tok-${USER}`,
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
    },
    undefined,
  );
  const wake = async () => {
    await act(async () => wakes.forEach((fn) => fn()));
    await advance(10);
  };
  return { view, storage, wake, sessions: () => view.result.current.sessions };
}

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

async function addPerson(d: ReturnType<typeof device>, personName: string): Promise<string> {
  act(() => {
    d.view.result.current.createSession({ personName });
  });
  await advance(10);
  return d.sessions().find((s) => s.personName === personName)?.flowId ?? '';
}

/** Device A makes people and syncs them; device B then pulls them. */
async function twoDevices(client: FlowSyncClient, names: string[]) {
  const a = device(client);
  const ids: string[] = [];
  for (const name of names) {
    ids.push(await addPerson(a, name));
  }
  await advance(EDIT_DEBOUNCE_MS + 10);
  const b = device(client);
  await advance(10);
  expect(b.sessions()).toHaveLength(names.length);
  return { b, ids };
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('a person the server names as removed (#1084)', () => {
  it('leaves the other device at its next wake, and nothing is sent for them afterwards', async () => {
    const { server, client } = fakeServer();
    const { b, ids } = await twoDevices(client, ['Anna', 'Ben']);
    const before = { ...server.calls };

    server.remove(ids[0]); // deleted on web
    await b.wake();
    expect(b.sessions().map((s) => s.flowId)).toEqual([ids[1]]);

    await b.wake();
    await b.wake();
    await advance(EDIT_DEBOUNCE_MS + 10);
    expect(server.calls.create).toBe(before.create);
    expect(server.calls.patch).toBe(before.patch);
  });

  it('an empty list with removed: [] removes nobody', async () => {
    const { server, client } = fakeServer();
    const { b } = await twoDevices(client, ['Anna', 'Ben', 'Cara']);
    const creates = server.calls.create;

    server.flows.clear(); // a stranger answer: 200, no flows, nothing named
    for (let i = 0; i < 4; i++) {
      await b.wake();
    }

    expect(b.sessions()).toHaveLength(3);
    expect(server.calls.create).toBe(creates);
  });

  it('keeps a person this device never pushed, and then creates them', async () => {
    const { server, client } = fakeServer();
    server.createOffline = true;
    const b = device(client);
    const flowId = await addPerson(b, 'Margaret Hayes');
    await b.wake();
    await b.wake();
    expect(b.sessions().map((s) => s.flowId)).toEqual([flowId]);

    server.createOffline = false;
    await b.wake();
    await advance(EDIT_DEBOUNCE_MS + 10);
    expect(b.sessions().map((s) => s.flowId)).toEqual([flowId]);
    expect(server.flows.has(flowId)).toBe(true);
  });

  it('discards a queued edit with the person, and sends nothing more', async () => {
    const { server, client } = fakeServer();
    const { b, ids } = await twoDevices(client, ['Margaret Hayes']);

    server.patchOffline = true; // the edit stays queued
    act(() => b.view.result.current.updateSession(b.sessions()[0].id, { personName: 'Margaret H.' }));
    await advance(EDIT_DEBOUNCE_MS + 10);
    server.remove(ids[0]);
    server.patchOffline = false;
    const before = { ...server.calls };
    await b.wake(); // the pull names the person; the cycle that follows must not send the edit
    expect(b.sessions()).toEqual([]);
    expect(server.calls.patch).toBe(before.patch);

    const after = { ...server.calls };
    await b.wake();
    await b.wake();
    await advance(EDIT_DEBOUNCE_MS + 10);
    expect(server.calls.patch).toBe(after.patch);
    expect(server.calls.create).toBe(after.create);
  });

  it('drops the right session when the removed id is the new id of a moved person', async () => {
    const { server, client } = fakeServer();
    const b = device(client, {
      sessions: [sessionRecord(OLD), sessionRecord(FLOW, { id: 'other', personName: 'Ben' })],
      sync: { queue: {}, known: [OLD], baselines: {}, moved: { [OLD]: '55555555-5555-4555-8555-555555555555' } },
    });
    server.nameRemoved('55555555-5555-4555-8555-555555555555');
    await advance(10);
    await b.wake();

    expect(b.sessions().map((s) => s.personName)).toEqual(['Ben']);
  });

  it('keeps a person the same list still has, even if the id is also named', async () => {
    const { server, client } = fakeServer();
    const { b, ids } = await twoDevices(client, ['Anna']);

    server.nameRemoved(ids[0]);
    await b.wake();
    expect(b.sessions()).toHaveLength(1);
  });

  it('keeps everyone when the list is offline, even if a person was deleted', async () => {
    const { server, client } = fakeServer();
    const { b, ids } = await twoDevices(client, ['Anna', 'Ben']);

    server.remove(ids[0]);
    server.listOffline = true;
    for (let i = 0; i < 3; i++) {
      await b.wake();
    }
    expect(b.sessions()).toHaveLength(2);
  });

  it.each([
    ['held for another account', { ownerId: null, heldFor: OTHER }],
    ['owned by another account', { ownerId: OTHER }],
  ])('keeps a person %s, with no create loop', async (_name, over) => {
    const { server, client } = fakeServer();
    server.nameRemoved(FLOW);
    const b = device(client, {
      sessions: [sessionRecord(FLOW, over)],
      sync: { queue: {}, known: [FLOW], baselines: {} },
    });
    await advance(10);
    await b.wake();
    await b.wake();
    await advance(EDIT_DEBOUNCE_MS + 10);

    expect(b.storage.data.get('gg.sessions.v1')).toContain(FLOW);
    expect(b.storage.data.get(flowQueueKey(USER))).toContain(FLOW); // sync state kept too: one decision
    expect(server.calls.create).toBe(0);
    expect(server.calls.patch).toBe(0);
  });
});
