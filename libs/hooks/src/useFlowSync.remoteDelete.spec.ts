import { act, renderHook } from '@testing-library/react';
import type { FlowRecord, SyncedFields } from '@griever/shared';
import { EDIT_DEBOUNCE_MS, useFlowSync } from './useFlowSync.js';
import type { FlowSyncClient } from './useFlowSync.js';
import { useSessions } from './useSessions.js';

// A person deleted on one device leaves the owner's other devices at their next clean pull (#1084).

const USER = 'user_me';
const OTHER = 'user_other';
const FLOW = '33333333-3333-4333-8333-333333333333';

const ownerOf = (token: string): string => token.slice('tok-'.length);

/** One server shared by every device. The token names the account; each list shows only that account's people. */
function fakeServer() {
  const flows = new Map<string, FlowRecord>();
  const calls = { list: 0, create: 0, patch: 0 };
  const server = {
    flows,
    calls,
    dropped: 0,
    listOffline: false,
    writesOffline: false,
    /** Ids whose create gets `taken` and whose PATCH gets 404: another account holds them (#942). */
    taken: new Set<string>(),
    createGate: null as Promise<void> | null,
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
      return { ok: true, flows: [...flows.values()].filter((r) => r.ownerId === ownerOf(token)), dropped: server.dropped };
    },
    createFlow: async (token, id, fields) => {
      calls.create += 1;
      if (server.createGate) {
        await server.createGate;
      }
      if (server.writesOffline) {
        return { ok: false, reason: 'offline' };
      }
      if (server.taken.has(id)) {
        return { ok: false, reason: 'taken' };
      }
      const record = toRecord(id, ownerOf(token), fields);
      flows.set(id, record);
      return { ok: true, flow: record };
    },
    patchFlow: async (token, id, partial) => {
      calls.patch += 1;
      const found = flows.get(id);
      if (server.writesOffline) {
        return { ok: false, reason: 'offline' };
      }
      if (!found || server.taken.has(id)) {
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

/** One phone or browser: its own storage, the real useSessions and the real useFlowSync. */
function device(client: FlowSyncClient, userId = USER, seed: object[] = []) {
  const storage = memoryStorage();
  if (seed.length > 0) {
    storage.data.set('gg.sessions.v1', JSON.stringify(seed));
  }
  const wakes = new Set<() => void>();
  const view = renderHook(
    (props: { userId: string }) => {
      const sessions = useSessions(storage);
      const sync = useFlowSync({
        sessions: sessions.sessions,
        userId: props.userId,
        getAccessToken: async () => `tok-${props.userId}`,
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
      return { sessions, sync };
    },
    { initialProps: { userId } },
  );
  const wake = async () => {
    await act(async () => wakes.forEach((fn) => fn()));
    await advance(10);
  };
  return { view, storage, wake, sessions: () => view.result.current.sessions.sessions };
}

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

/** A person made on this device, ready to sync. Returns their flowId. */
async function addPerson(d: ReturnType<typeof device>, personName = 'Margaret Hayes'): Promise<string> {
  act(() => {
    d.view.result.current.sessions.createSession({ personName });
  });
  await advance(10);
  return d.sessions()[0].flowId;
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('a person deleted on another device (#1084)', () => {
  it('goes at the next wake pull of the owner\'s other device', async () => {
    const { server, client } = fakeServer();
    const a = device(client);
    const flowId = await addPerson(a);
    const b = device(client);
    await advance(10);
    expect(b.sessions().map((s) => s.flowId)).toEqual([flowId]);

    server.flows.delete(flowId); // deleted on web
    await b.wake();

    expect(b.sessions()).toEqual([]);
  });

  it('keeps a person this device never pushed, and then creates them', async () => {
    const { server, client } = fakeServer();
    server.writesOffline = true;
    const b = device(client);
    const flowId = await addPerson(b);
    await advance(EDIT_DEBOUNCE_MS + 10);
    await b.wake();
    expect(b.sessions().map((s) => s.flowId)).toEqual([flowId]);

    server.writesOffline = false;
    await b.wake();
    await advance(EDIT_DEBOUNCE_MS + 10);
    expect(b.sessions().map((s) => s.flowId)).toEqual([flowId]);
    expect(server.flows.has(flowId)).toBe(true);
  });

  it('keeps a person whose create is in flight when the list answers', async () => {
    const { server, client } = fakeServer();
    let release = () => {};
    server.createGate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const b = device(client);
    const flowId = await addPerson(b);
    await advance(EDIT_DEBOUNCE_MS + 10);
    expect(server.calls.create).toBe(1);

    // The list is read while the create is still out, so it does not have the person yet.
    await act(async () => {
      await b.view.result.current.sync.pullNow();
    });
    expect(b.sessions().map((s) => s.flowId)).toEqual([flowId]);

    release();
    await advance(10);
    expect(server.flows.has(flowId)).toBe(true);
    expect(b.sessions().map((s) => s.flowId)).toEqual([flowId]);
  });

  it('stays when the pull dropped records, and goes at the next clean pull', async () => {
    const { server, client } = fakeServer();
    const a = device(client);
    const flowId = await addPerson(a);
    const b = device(client);
    await advance(10);

    server.flows.delete(flowId);
    server.dropped = 1;
    await b.wake();
    expect(b.sessions()).toHaveLength(1);

    server.dropped = 0;
    await b.wake();
    expect(b.sessions()).toEqual([]);
  });

  it('does not remove a person whose id another account took: a new id is made and created (#942)', async () => {
    const { server, client } = fakeServer();
    server.taken.add(FLOW);
    const b = device(client, USER, [
      {
        id: 'local-1',
        flowId: FLOW,
        ownerId: USER,
        role: 'owner',
        personName: 'Margaret Hayes',
        createdAt: '2026-01-01T00:00:00.000Z',
        lastOpenedAt: '2026-01-01T00:00:00.000Z',
        drafts: {},
        recipientsNotified: {},
        momentCompletedAt: {},
        remindersScheduled: [],
      },
    ]);
    await advance(EDIT_DEBOUNCE_MS + 10);
    await b.wake();
    await advance(EDIT_DEBOUNCE_MS + 10);

    expect(b.sessions()).toHaveLength(1);
    const [session] = b.sessions();
    expect(session.flowId).not.toBe(FLOW);
    expect(server.flows.has(session.flowId)).toBe(true);
  });

  it('drops a queued edit with the person: 404, pull removes them, then no further writes', async () => {
    const { server, client } = fakeServer();
    const a = device(client);
    const flowId = await addPerson(a);
    const b = device(client);
    await advance(10);

    server.flows.delete(flowId);
    act(() => b.view.result.current.sessions.updateSession(b.sessions()[0].id, { personName: 'Margaret H.' }));
    await advance(EDIT_DEBOUNCE_MS + 10);
    expect(b.sessions()).toEqual([]);

    const before = { ...server.calls };
    await b.wake();
    await b.wake();
    await advance(EDIT_DEBOUNCE_MS + 10);
    expect(server.calls.create).toBe(before.create);
    expect(server.calls.patch).toBe(before.patch);
  });

  it('keeps the person when the pull is offline', async () => {
    const { server, client } = fakeServer();
    const a = device(client);
    const flowId = await addPerson(a);
    const b = device(client);
    await advance(10);

    server.flows.delete(flowId);
    server.listOffline = true;
    await b.wake();
    expect(b.sessions()).toHaveLength(1);
  });

  it('does not remove one account\'s person when another account is signed in', async () => {
    const { client } = fakeServer();
    const a = device(client);
    const flowId = await addPerson(a);
    // The same browser signs in as someone else; their list never had this person.
    a.view.rerender({ userId: OTHER });
    await advance(10);
    await a.wake();

    expect(a.storage.getItem('gg.sessions.v1')).toContain(flowId);
  });
});
