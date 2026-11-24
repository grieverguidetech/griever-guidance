import { act, renderHook } from '@testing-library/react';
import type { FlowRecord, SyncedFields } from '@griever/shared';
import { EDIT_DEBOUNCE_MS, flowQueueKey, useFlowSync } from './useFlowSync.js';
import type { FlowSyncClient } from './useFlowSync.js';
import { useSessions } from './useSessions.js';

// A person deleted on one device leaves the owner's other devices (#1084): only after two clean pulls in a
// row omit them, never when a list is empty for the whole account, and never re-created.

const USER = 'user_me';
const OTHER = 'user_other';
const FLOW = '33333333-3333-4333-8333-333333333333';
const OLD = '44444444-4444-4444-8444-444444444444';

const ownerOf = (token: string): string => token.slice('tok-'.length);

/** A promise a test settles by hand, to hold a request open. */
function gate() {
  let open = () => {};
  const wait = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { wait, open };
}

/** One server shared by every device. The token names the account; each list shows only that account's people. */
function fakeServer() {
  const flows = new Map<string, FlowRecord>();
  const deleted = new Set<string>();
  const calls = { list: 0, create: 0, patch: 0 };
  const server = {
    flows,
    calls,
    dropped: 0,
    listOffline: false,
    patchOffline: false,
    createOffline: false,
    /** Ids whose create gets `taken` and whose PATCH gets 404: another account holds them (#942). */
    taken: new Set<string>(),
    /** Every id is held by another account. */
    takenAll: false,
    listGate: null as Promise<void> | null,
    createGate: null as Promise<void> | null,
    patchGate: null as Promise<void> | null,
    /** Deleted on web: gone from the list, and its id stays taken, so a create gets `conflict` like the real server. */
    remove: (id: string) => {
      flows.delete(id);
      deleted.add(id);
    },
    restore: (record: FlowRecord) => {
      deleted.delete(record.id);
      flows.set(record.id, record);
    },
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
      // The answer is read before the wait, like a server that answered and the network held it.
      const answer = [...flows.values()].filter((r) => r.ownerId === ownerOf(token));
      if (server.listGate) {
        await server.listGate;
      }
      if (server.listOffline) {
        return { ok: false, reason: 'offline' };
      }
      return { ok: true, flows: answer, dropped: server.dropped };
    },
    createFlow: async (token, id, fields) => {
      calls.create += 1;
      if (server.createGate) {
        await server.createGate;
      }
      if (server.createOffline) {
        return { ok: false, reason: 'offline' };
      }
      if (server.takenAll || server.taken.has(id)) {
        return { ok: false, reason: 'taken' };
      }
      if (deleted.has(id)) {
        return { ok: false, reason: 'conflict' };
      }
      const record = toRecord(id, ownerOf(token), fields);
      flows.set(id, record);
      return { ok: true, flow: record };
    },
    patchFlow: async (token, id, partial) => {
      calls.patch += 1;
      if (server.patchGate) {
        await server.patchGate;
      }
      if (server.patchOffline) {
        return { ok: false, reason: 'offline' };
      }
      const found = flows.get(id);
      if (!found || server.takenAll || server.taken.has(id)) {
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

const sessionRecord = (flowId: string, personName = 'Margaret Hayes') => ({
  id: `local-${flowId.slice(0, 4)}`,
  flowId,
  ownerId: USER,
  role: 'owner',
  personName,
  createdAt: '2026-01-01T00:00:00.000Z',
  lastOpenedAt: '2026-01-01T00:00:00.000Z',
  drafts: {},
  recipientsNotified: {},
  momentCompletedAt: {},
  remindersScheduled: [],
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
    { initialProps: { userId: USER } },
  );
  const wake = async () => {
    await act(async () => wakes.forEach((fn) => fn()));
    await advance(10);
  };
  const pullNow = () =>
    act(async () => {
      await view.result.current.sync.pullNow();
    });
  const syncState = () => JSON.parse(storage.data.get(flowQueueKey(USER)) ?? '{}') as { known?: string[]; missing?: string[] };
  return { view, storage, wake, pullNow, syncState, sessions: () => view.result.current.sessions.sessions };
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
  const found = d.sessions().find((s) => s.personName === personName);
  return found ? found.flowId : '';
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
  return { a, b, ids };
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('a person deleted on another device (#1084)', () => {
  it('goes at the second clean pull that omits them, and is never created again', async () => {
    const { server, client } = fakeServer();
    const { b, ids } = await twoDevices(client, ['Margaret Hayes']);

    server.remove(ids[0]); // deleted on web
    const creates = server.calls.create;
    await b.wake();
    expect(b.sessions()).toHaveLength(1);
    await b.wake();
    expect(b.sessions()).toEqual([]);
    await b.wake();
    await advance(EDIT_DEBOUNCE_MS + 10);
    expect(server.calls.create).toBe(creates);
  });

  it('keeps a person who is missing from one pull and back in the next, and sends no create', async () => {
    const { server, client } = fakeServer();
    const { b, ids } = await twoDevices(client, ['Margaret Hayes']);
    const record = server.flows.get(ids[0]) as FlowRecord;
    const creates = server.calls.create;

    server.flows.delete(ids[0]);
    await b.wake();
    server.restore(record);
    await b.wake();
    await b.wake();
    await advance(EDIT_DEBOUNCE_MS + 10);

    expect(b.sessions()).toHaveLength(1);
    expect(server.calls.create).toBe(creates);
  });

  it('never empties an account: an empty list for 3 people removes none of them, over several wakes', async () => {
    const { server, client } = fakeServer();
    const { b } = await twoDevices(client, ['Anna', 'Ben', 'Cara']);
    const creates = server.calls.create;

    server.flows.clear(); // a stranger's answer: 200 and []
    for (let i = 0; i < 4; i++) {
      await b.wake();
    }

    expect(b.sessions()).toHaveLength(3);
    expect(server.calls.create).toBe(creates);
  });

  it('removes only the deleted person when others are still listed', async () => {
    const { server, client } = fakeServer();
    const { b, ids } = await twoDevices(client, ['Anna', 'Ben']);

    server.remove(ids[0]);
    await b.wake();
    await b.wake();

    expect(b.sessions().map((s) => s.flowId)).toEqual([ids[1]]);
  });

  it('keeps a person this device never pushed, and then creates them', async () => {
    const { server, client } = fakeServer();
    server.createOffline = true;
    const b = device(client);
    const flowId = await addPerson(b);
    await b.wake();
    await b.wake();
    await b.wake();
    expect(b.sessions().map((s) => s.flowId)).toEqual([flowId]);

    server.createOffline = false;
    await b.wake();
    await advance(EDIT_DEBOUNCE_MS + 10);
    expect(server.flows.has(flowId)).toBe(true);
    expect(b.sessions().map((s) => s.flowId)).toEqual([flowId]);
  });

  it('keeps a person whose create is in flight when the list answers', async () => {
    const { server, client } = fakeServer();
    const create = gate();
    server.createGate = create.wait;
    const b = device(client);
    const flowId = await addPerson(b);
    await advance(EDIT_DEBOUNCE_MS + 10);
    expect(server.calls.create).toBe(1);

    await b.pullNow();
    await b.pullNow();
    expect(b.sessions().map((s) => s.flowId)).toEqual([flowId]);

    create.open();
    await advance(10);
    expect(server.flows.has(flowId)).toBe(true);
    expect(b.sessions().map((s) => s.flowId)).toEqual([flowId]);
  });

  it('keeps a person whose create finishes while the list request is out', async () => {
    const { server, client } = fakeServer();
    const create = gate();
    server.createGate = create.wait;
    const b = device(client);
    const flowId = await addPerson(b);
    await advance(EDIT_DEBOUNCE_MS + 10);

    const list = gate();
    server.listGate = list.wait;
    const pulled = b.pullNow(); // the list is read now: the person is not on the server yet
    create.open();
    await advance(10);
    list.open();
    await pulled;
    server.listGate = null;
    await b.wake();
    await b.wake();

    expect(b.sessions().map((s) => s.flowId)).toEqual([flowId]);
    expect(server.flows.has(flowId)).toBe(true);
  });

  it('keeps a person when the pull dropped records, and removes them after two clean pulls', async () => {
    const { server, client } = fakeServer();
    const { b, ids } = await twoDevices(client, ['Margaret Hayes']);

    server.remove(ids[0]);
    server.dropped = 1;
    await b.wake();
    await b.wake();
    await b.wake();
    expect(b.sessions()).toHaveLength(1);

    server.dropped = 0;
    await b.wake();
    expect(b.sessions()).toHaveLength(1);
    await b.wake();
    expect(b.sessions()).toEqual([]);
  });

  it('keeps a person whose id another account took, until a new id is made and created (#942)', async () => {
    const { server, client } = fakeServer();
    server.taken.add(FLOW);
    server.patchOffline = true; // create gets taken, then the PATCH cannot answer: the id stays conflicted
    const b = device(client, { sessions: [sessionRecord(FLOW)] });
    await advance(EDIT_DEBOUNCE_MS + 10);
    for (let i = 0; i < 3; i++) {
      await b.wake();
    }
    expect(b.sessions().map((s) => s.flowId)).toEqual([FLOW]);

    server.patchOffline = false;
    await b.wake();
    await advance(EDIT_DEBOUNCE_MS + 10);
    expect(b.sessions()).toHaveLength(1);
    expect(b.sessions()[0].flowId).not.toBe(FLOW);
    expect(server.flows.has(b.sessions()[0].flowId)).toBe(true);
  });

  it('keeps a person whose taken id is not queued and not listed (conflicted)', async () => {
    const { server, client } = fakeServer();
    server.takenAll = true; // create gets taken and PATCH 404, also for the new id: the edit is dropped and a pull follows
    const b = device(client, { sessions: [sessionRecord(FLOW)] });
    await advance(EDIT_DEBOUNCE_MS + 10);
    const creates = server.calls.create;
    for (let i = 0; i < 4; i++) {
      await b.wake();
    }

    expect(b.sessions()).toHaveLength(1);
    expect(server.calls.create).toBe(creates);
  });

  it('removes a person who moved to a new id and was then deleted, with no create or PATCH loop', async () => {
    const { server, client } = fakeServer();
    const b = device(client, {
      sessions: [sessionRecord(OLD)],
      sync: { queue: {}, known: [FLOW], baselines: {}, moved: { [OLD]: FLOW } },
    });
    await advance(10);
    await b.wake();
    await b.wake();
    await advance(EDIT_DEBOUNCE_MS + 10);

    expect(b.sessions()).toEqual([]);
    expect(server.calls.create).toBe(0);
    expect(server.calls.patch).toBe(0);
  });

  it('keeps a person whose PATCH is pending when the list answers', async () => {
    const { server, client } = fakeServer();
    const { b, ids } = await twoDevices(client, ['Margaret Hayes']);

    server.remove(ids[0]);
    await b.wake(); // missing once
    const patch = gate();
    server.patchGate = patch.wait;
    act(() => b.view.result.current.sessions.updateSession(b.sessions()[0].id, { personName: 'Margaret H.' }));
    await advance(EDIT_DEBOUNCE_MS + 10);
    expect(server.calls.patch).toBe(1);

    await b.pullNow(); // the person has an unsent edit: not counted as missing
    expect(b.sessions()).toHaveLength(1);

    server.patchGate = null;
    patch.open(); // 404: the edit is dropped and a pull follows
    await advance(10);
    await b.wake();
    await b.wake();
    expect(b.sessions()).toEqual([]);
  });

  it('drops a queued edit with the person: 404, two clean pulls, then no further writes', async () => {
    const { server, client } = fakeServer();
    const { b, ids } = await twoDevices(client, ['Margaret Hayes']);

    server.remove(ids[0]);
    await b.wake(); // missing once
    act(() => b.view.result.current.sessions.updateSession(b.sessions()[0].id, { personName: 'Margaret H.' }));
    await advance(EDIT_DEBOUNCE_MS + 10); // PATCH gets 404, the pull that follows sees the person missing again
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
    const { b, ids } = await twoDevices(client, ['Margaret Hayes']);

    server.remove(ids[0]);
    server.listOffline = true;
    for (let i = 0; i < 3; i++) {
      await b.wake();
    }
    expect(b.sessions()).toHaveLength(1);
  });

  it('does not use a list that came back after the account changed', async () => {
    const { server, client } = fakeServer();
    const { b, ids } = await twoDevices(client, ['Margaret Hayes']);

    server.remove(ids[0]);
    await b.wake(); // missing once
    const list = gate();
    server.listGate = list.wait;
    await act(async () => {
      void b.view.result.current.sync.pullNow();
    });
    b.view.rerender({ userId: OTHER });
    list.open();
    await advance(10);

    expect(b.syncState().known).toContain(ids[0]);
    expect(b.storage.data.get('gg.sessions.v1')).toContain(ids[0]);
  });
});
