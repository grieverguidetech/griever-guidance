import { act, renderHook } from '@testing-library/react';
import { FLOW_FACT_KEYS } from '@griever/shared';
import type { FlowFacts } from '@griever/shared';
import { freshDraft } from './useSendFlow.js';
import type { SendFlowStorage } from './useSendFlow.js';
import { useSessions } from './useSessions.js';
import type { Session } from './useSessions.js';
import {
  BACKOFF_MAX_MS,
  BACKOFF_START_MS,
  EDIT_DEBOUNCE_MS,
  flowQueueKey,
  PULL_INTERVAL_MS,
  REQUEST_TIMEOUT_MS,
  useFlowSync,
} from './useFlowSync.js';

const USER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const FLOW = '33333333-3333-4333-8333-333333333333';
const PULL = PULL_INTERVAL_MS;

interface Req {
  method: string;
  path: string;
  body: Record<string, unknown> | null;
}
type Reply = { status: number; body?: unknown } | 'offline' | 'hang';

const facts = (over: Partial<FlowFacts> = {}): FlowFacts => ({
  personName: 'Margaret Hayes',
  dateOfPassing: null,
  serviceDate: null,
  obituaryUrl: null,
  obituaryPublisher: null,
  serviceReady: false,
  ...over,
});

const record = (over: Partial<FlowFacts> = {}, ownerId = USER, id = FLOW) => ({
  id,
  ownerId,
  role: ownerId === USER ? 'owner' : 'member',
  facts: facts(over),
  updatedAt: '2026-10-01T00:00:00.000Z',
  updatedBy: null,
});

function session(over: Partial<Session> = {}): Session {
  return {
    id: 's1',
    flowId: FLOW,
    ownerId: USER,
    role: 'owner',
    personName: 'Margaret Hayes',
    dateOfPassing: '',
    serviceDate: '',
    obituaryUrl: '',
    obituaryPublisher: '',
    senderName: 'Sam Private',
    serviceReady: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    lastOpenedAt: '2026-01-01T00:00:00.000Z',
    drafts: { announcement: freshDraft({ templateCategory: 'announcement', selectedContactIds: ['c-secret'] }) },
    recipientsNotified: { announcement: ['c-secret'] },
    momentCompletedAt: {},
    remindersScheduled: [],
    ...over,
  } as Session;
}

function memoryStorage(initial: Record<string, string> = {}): SendFlowStorage & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

/** The signal each request was sent with, in request order. Reset by `mockFetch`. */
let signals: Array<AbortSignal | undefined> = [];

/** Rejects like a real fetch does when its signal aborts. */
function hang(signal: AbortSignal | undefined): Promise<Response> {
  return new Promise<Response>((_resolve, reject) => {
    signal?.addEventListener('abort', () => reject(new DOMException('The operation was aborted.', 'AbortError')));
  });
}

/** Stubs fetch; `route` decides each reply. Requests are recorded. */
function mockFetch(route: (req: Req) => Reply | Promise<Reply>) {
  const requests: Req[] = [];
  signals = [];
  const fn = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    signals.push(init?.signal ?? undefined);
    const path = new URL(String(input)).pathname;
    const req: Req = {
      method: init?.method ?? 'GET',
      path,
      body: typeof init?.body === 'string' ? (JSON.parse(init.body) as Record<string, unknown>) : null,
    };
    requests.push(req);
    const reply = await route(req);
    if (reply === 'offline') throw new TypeError('Failed to fetch');
    if (reply === 'hang') return hang(init?.signal ?? undefined);
    return new Response(JSON.stringify(reply.body ?? null), {
      status: reply.status,
      headers: { 'Content-Type': 'application/json' },
    });
  });
  vi.stubGlobal('fetch', fn);
  return requests;
}

const writes = (requests: Req[]) => requests.filter((r) => r.method !== 'GET');
const gets = (requests: Req[]) => requests.filter((r) => r.method === 'GET');

/** Server that has the flow and echoes writes. */
const serverWithFlow = (req: Req): Reply => {
  if (req.method === 'GET') return { status: 200, body: [record()] };
  return { status: 200, body: record(req.body as Partial<FlowFacts>) };
};

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

interface Props {
  sessions: Session[];
  enabled?: boolean;
  userId?: string;
}

function setup(
  initial: Session[],
  opts: { storage?: SendFlowStorage; enabled?: boolean; userId?: string } = {},
) {
  const wakes = new Set<() => void>();
  const applyRemoteFlows = vi.fn();
  const getAccessToken = vi.fn(async () => 'tok');
  const view = renderHook(
    (props: Props) =>
      useFlowSync({
        sessions: props.sessions,
        userId: props.userId ?? USER,
        getAccessToken,
        enabled: props.enabled ?? true,
        storage: opts.storage,
        subscribe: (fn) => {
          wakes.add(fn);
          return () => void wakes.delete(fn);
        },
        applyRemoteFlows,
      }),
    { initialProps: { sessions: initial, enabled: opts.enabled ?? true, userId: opts.userId ?? USER } as Props },
  );
  const wake = () => act(() => wakes.forEach((fn) => fn()));
  return { ...view, wake, applyRemoteFlows, getAccessToken };
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('useFlowSync sending', () => {
  it('sends only whitelisted keys, even when the session carries drafts, contacts, recipients and wording (C2/C3)', async () => {
    const requests = mockFetch((req) =>
      req.method === 'GET' ? { status: 200, body: [] } : { status: 201, body: record() },
    );
    const withWording = session({
      drafts: {
        announcement: freshDraft({
          templateCategory: 'announcement',
          selectedContactIds: ['c-secret'],
          messageOverride: 'my private words',
        }),
      },
    });
    const { rerender } = setup([withWording]);
    await advance(10);
    // A later edit goes out as a PATCH; check that body too.
    rerender({ sessions: [{ ...withWording, serviceDate: 'June 3' }] });
    await advance(EDIT_DEBOUNCE_MS + 10);

    const sent = writes(requests);
    expect(sent.map((r) => r.method)).toEqual(['POST', 'PATCH']);
    for (const req of sent) {
      expect(Object.keys(req.body ?? {}).length).toBeGreaterThan(0);
      for (const key of Object.keys(req.body ?? {})) {
        expect([...FLOW_FACT_KEYS, 'id']).toContain(key);
      }
    }
    const raw = JSON.stringify(sent);
    expect(raw).not.toContain('c-secret');
    expect(raw).not.toContain('my private words');
    expect(raw).not.toContain('Sam Private');
    expect(sent[0].body).toMatchObject({ id: FLOW, personName: 'Margaret Hayes' });
  });

  it('sends two quick edits to the same person as one PATCH with both fields', async () => {
    const requests = mockFetch(serverWithFlow);
    const base = session();
    const { rerender } = setup([base]);
    await advance(10);
    rerender({ sessions: [{ ...base, serviceDate: 'June 3' }] });
    await advance(200);
    rerender({ sessions: [{ ...base, serviceDate: 'June 3', obituaryPublisher: 'Legacy' }] });
    await advance(EDIT_DEBOUNCE_MS + 10);
    expect(writes(requests)).toEqual([
      { method: 'PATCH', path: `/flows/${FLOW}`, body: { serviceDate: 'June 3', obituaryPublisher: 'Legacy' } },
    ]);
  });

  it('switches to PATCH when the server already has the person (409 on create)', async () => {
    const requests = mockFetch((req) => {
      if (req.method === 'GET') return { status: 200, body: [] };
      if (req.method === 'POST') return { status: 409, body: { error: 'exists' } };
      return { status: 200, body: record() };
    });
    setup([session()]);
    await advance(10);
    expect(writes(requests).map((r) => r.method)).toEqual(['POST', 'PATCH']);
  });

  it('never creates a person someone shared (member) or another account owns', async () => {
    const requests = mockFetch((req) => (req.method === 'GET' ? { status: 200, body: [] } : { status: 201 }));
    const member = session({ role: 'member', ownerId: OTHER });
    const foreign = session({ id: 's2', flowId: OTHER, role: 'owner', ownerId: OTHER });
    setup([member, foreign]);
    await advance(10);
    expect(writes(requests)).toEqual([]);
  });

  it('lets a member PATCH an edit', async () => {
    const requests = mockFetch(serverWithFlow);
    const member = session({ role: 'member', ownerId: OTHER });
    const { rerender } = setup([member]);
    await advance(10);
    rerender({ sessions: [{ ...member, serviceReady: true }] });
    await advance(EDIT_DEBOUNCE_MS + 10);
    expect(writes(requests)).toEqual([{ method: 'PATCH', path: `/flows/${FLOW}`, body: { serviceReady: true } }]);
  });

  it('sends nothing for an empty name', async () => {
    const requests = mockFetch(() => ({ status: 200, body: [] }));
    setup([session({ personName: '  ' })]);
    await advance(10);
    expect(writes(requests)).toEqual([]);
  });

  it('makes no requests when disabled', async () => {
    const requests = mockFetch(serverWithFlow);
    const base = session();
    const { rerender, wake } = setup([base], { enabled: false });
    rerender({ sessions: [{ ...base, serviceDate: 'June 3' }], enabled: false });
    wake();
    await advance(EDIT_DEBOUNCE_MS + PULL);
    expect(requests).toEqual([]);
  });
});


describe('useFlowSync failures (C5)', () => {
  it('keeps edits offline, throws nothing, backs off, and flushes after a wake once online', async () => {
    let online = true;
    const requests = mockFetch((req) => {
      if (!online) return 'offline';
      return serverWithFlow(req);
    });
    const base = session();
    const { rerender, wake, result } = setup([base]);
    await advance(10);
    online = false;
    rerender({ sessions: [{ ...base, serviceDate: 'June 3' }] });
    await advance(EDIT_DEBOUNCE_MS + 10);
    expect(result.current.lastError).toBe('offline');
    expect(writes(requests).length).toBe(1);

    // Backoff doubles from 5 s and stops at 5 min.
    const before = requests.length;
    await advance(BACKOFF_START_MS - 100);
    expect(requests.length).toBe(before);
    await advance(100 + 10);
    expect(requests.length).toBeGreaterThan(before);
    await advance(BACKOFF_MAX_MS * 2);
    online = true;
    await wake();
    await advance(10);
    const last = writes(requests).at(-1);
    expect(last).toEqual({ method: 'PATCH', path: `/flows/${FLOW}`, body: { serviceDate: 'June 3' } });
    expect(result.current.lastError).toBeNull();
    const count = requests.length;
    await advance(BACKOFF_MAX_MS);
    expect(writes(requests).length).toBe(writes(requests.slice(0, count)).length);
  });

  it('keeps the edit on a 5xx', async () => {
    let status = 503;
    const requests = mockFetch((req) =>
      req.method === 'GET' ? { status: 200, body: [record()] } : { status, body: status === 200 ? record() : null },
    );
    const base = session();
    const { rerender } = setup([base]);
    await advance(10);
    rerender({ sessions: [{ ...base, serviceDate: 'June 3' }] });
    await advance(EDIT_DEBOUNCE_MS + 10);
    status = 200;
    await advance(BACKOFF_START_MS + 10);
    expect(writes(requests).map((r) => r.body)).toEqual([{ serviceDate: 'June 3' }, { serviceDate: 'June 3' }]);
  });

  it('does not stall on a request that never answers', async () => {
    const requests = mockFetch((req) => (req.method === 'GET' ? 'hang' : { status: 200, body: record() }));
    const { result } = setup([session()]);
    await advance(REQUEST_TIMEOUT_MS + 10);
    expect(result.current.lastError).toBe('offline');
    await advance(BACKOFF_START_MS + 10);
    expect(gets(requests).length).toBe(2);
  });

  it('aborts a request that times out (#164)', async () => {
    mockFetch((req) => (req.method === 'GET' ? 'hang' : { status: 200, body: record() }));
    setup([session()]);
    await advance(REQUEST_TIMEOUT_MS - 10);
    expect(signals[0]?.aborted).toBe(false);
    await advance(20);
    expect(signals[0]?.aborted).toBe(true);
  });

  it('keeps and resends an edit whose PATCH timed out and was aborted (#164)', async () => {
    let hangPatch = true;
    const requests = mockFetch((req) => {
      if (req.method === 'GET') return { status: 200, body: [record()] };
      return hangPatch ? 'hang' : { status: 200, body: record() };
    });
    const base = session();
    const { rerender, result } = setup([base]);
    await advance(10);
    rerender({ sessions: [{ ...base, serviceDate: 'June 3' }] });
    await advance(EDIT_DEBOUNCE_MS + REQUEST_TIMEOUT_MS + 10);
    const patchSignal = signals[requests.findIndex((r) => r.method === 'PATCH')];
    expect(patchSignal?.aborted).toBe(true);
    expect(result.current.lastError).toBe('offline');
    hangPatch = false;
    await advance(BACKOFF_START_MS + 10);
    expect(writes(requests).map((r) => r.body)).toEqual([{ serviceDate: 'June 3' }, { serviceDate: 'June 3' }]);
    expect(result.current.lastError).toBe(null);
  });

  it('drops that person\'s patch on a 403 and pulls', async () => {
    const requests = mockFetch((req) => {
      if (req.method === 'GET') return { status: 200, body: [record()] };
      return { status: 403, body: { error: 'no' } };
    });
    const base = session();
    const { rerender, applyRemoteFlows } = setup([base]);
    await advance(10);
    applyRemoteFlows.mockClear();
    const getsBefore = gets(requests).length;
    rerender({ sessions: [{ ...base, serviceDate: 'June 3' }] });
    await advance(EDIT_DEBOUNCE_MS + 10);
    expect(writes(requests).length).toBe(1);
    expect(gets(requests).length).toBe(getsBefore + 1);
    // The pull no longer protects the dropped edit, and it is not sent again.
    expect(applyRemoteFlows).toHaveBeenCalledTimes(1);
    expect(applyRemoteFlows.mock.calls[0][2]).toEqual({});
    await advance(BACKOFF_MAX_MS);
    expect(writes(requests).length).toBe(1);
  });

  it('keeps going for other people after a 404 on one', async () => {
    const OTHER_FLOW = '44444444-4444-4444-8444-444444444444';
    const requests = mockFetch((req) => {
      if (req.method === 'GET') return { status: 200, body: [record(), record({}, USER, OTHER_FLOW)] };
      return req.path.endsWith(FLOW) ? { status: 404 } : { status: 200, body: record({}, USER, OTHER_FLOW) };
    });
    const a = session();
    const b = session({ id: 's2', flowId: OTHER_FLOW });
    const { rerender } = setup([a, b]);
    await advance(10);
    rerender({ sessions: [{ ...a, serviceDate: 'x' }, { ...b, serviceDate: 'y' }] });
    await advance(EDIT_DEBOUNCE_MS + 10);
    expect(writes(requests).map((r) => r.path)).toEqual([`/flows/${FLOW}`, `/flows/${OTHER_FLOW}`]);
  });

  it('clears pending fields the server calls invalid (400)', async () => {
    const requests = mockFetch((req) => (req.method === 'GET' ? { status: 200, body: [record()] } : { status: 400 }));
    const storage = memoryStorage();
    const base = session();
    const { rerender } = setup([base], { storage });
    await advance(10);
    rerender({ sessions: [{ ...base, serviceDate: 'June 3' }] });
    await advance(EDIT_DEBOUNCE_MS + 10);
    expect(JSON.parse(storage.data.get(flowQueueKey(USER)) ?? '{}').queue).toEqual({});
    await advance(BACKOFF_MAX_MS);
    expect(writes(requests).length).toBe(1);
  });

  it('survives storage that throws', async () => {
    const requests = mockFetch(serverWithFlow);
    const storage: SendFlowStorage = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
      removeItem: () => undefined,
    };
    const base = session();
    const { rerender } = setup([base], { storage });
    await advance(10);
    rerender({ sessions: [{ ...base, serviceDate: 'June 3' }] });
    await advance(EDIT_DEBOUNCE_MS + 10);
    expect(writes(requests).length).toBe(1);
  });

  it('survives a token that throws', async () => {
    const requests = mockFetch(serverWithFlow);
    const wakes: Array<() => void> = [];
    expect(() =>
      renderHook(() =>
        useFlowSync({
          sessions: [session()],
          userId: USER,
          getAccessToken: async () => {
            throw new Error('no token');
          },
          enabled: true,
          subscribe: (fn) => {
            wakes.push(fn);
            return () => undefined;
          },
          applyRemoteFlows: vi.fn(),
        }),
      ),
    ).not.toThrow();
    await advance(10);
    expect(requests).toEqual([]);
  });
});

describe('useFlowSync pulling', () => {
  it('passes the list and its dropped count straight to applyRemoteFlows', async () => {
    mockFetch((req) => (req.method === 'GET' ? { status: 200, body: [record(), { id: 'bad' }] } : { status: 200 }));
    const { applyRemoteFlows } = setup([session()]);
    await advance(10);
    expect(applyRemoteFlows).toHaveBeenCalledTimes(1);
    const [result, userId] = applyRemoteFlows.mock.calls[0];
    expect(result.flows).toHaveLength(1);
    expect(result.dropped).toBe(1);
    expect(userId).toBe(USER);
  });

  it('pulls on wake and every ten minutes', async () => {
    const requests = mockFetch(serverWithFlow);
    const { wake } = setup([session()]);
    await advance(10);
    expect(gets(requests).length).toBe(1);
    await wake();
    await advance(10);
    expect(gets(requests).length).toBe(2);
    await advance(PULL);
    expect(gets(requests).length).toBe(3);
  });

  it('does not let an older remote value overwrite a pending local edit', async () => {
    mockFetch((req) =>
      req.method === 'GET' ? { status: 200, body: [record({ personName: 'Old Name' })] } : 'offline',
    );
    const base = session();
    const { rerender, wake, applyRemoteFlows } = setup([base]);
    await advance(10);
    // The edit cannot be sent (writes fail), so it stays pending across the next pull.
    rerender({ sessions: [{ ...base, personName: 'Margaret Ann Hayes' }] });
    await advance(EDIT_DEBOUNCE_MS + 10);
    applyRemoteFlows.mockClear();
    await wake();
    await advance(10);
    const pending = applyRemoteFlows.mock.calls.at(-1)?.[2] as Record<string, string[]>;
    expect(pending[FLOW]).toEqual(['personName']);
  });
});

describe('useFlowSync persistence', () => {
  it('restores the queue after a reload', async () => {
    mockFetch(() => ({ status: 200, body: [record()] }));
    const storage = memoryStorage();
    const base = session();
    const first = setup([base], { storage });
    await advance(10);
    // Writes fail, so the edit is still queued when the "app" closes.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('offline');
      }),
    );
    first.rerender({ sessions: [{ ...base, serviceDate: 'June 3' }] });
    await advance(EDIT_DEBOUNCE_MS + 10);
    first.unmount();
    expect(JSON.parse(storage.data.get(flowQueueKey(USER)) ?? '{}').queue[FLOW]).toEqual({ serviceDate: 'June 3' });

    const requests = mockFetch(serverWithFlow);
    setup([{ ...base, serviceDate: 'June 3' }], { storage });
    await advance(EDIT_DEBOUNCE_MS + 10);
    expect(writes(requests)).toEqual([{ method: 'PATCH', path: `/flows/${FLOW}`, body: { serviceDate: 'June 3' } }]);
  });

  it('ignores a saved queue from another account or with unknown keys', async () => {
    const requests = mockFetch(serverWithFlow);
    const stored = (userId: string, pending: object) =>
      JSON.stringify({ userId, queue: { [FLOW]: pending }, known: [FLOW] });
    setup([session()], { storage: memoryStorage({ [flowQueueKey(OTHER)]: stored(OTHER, { serviceDate: 'x' }) }) });
    await advance(EDIT_DEBOUNCE_MS + 10);
    setup([session()], {
      storage: memoryStorage({ [flowQueueKey(USER)]: stored(USER, { recipientsNotified: ['c-secret'] }) }),
    });
    await advance(EDIT_DEBOUNCE_MS + 10);
    expect(writes(requests)).toEqual([]);
  });
});

describe('useFlowSync edits made while sync is off (B1)', () => {
  it('sends an edit made while disabled once enabled, and protects it from the pull', async () => {
    const requests = mockFetch(serverWithFlow);
    const storage = memoryStorage();
    const base = session();
    const { rerender, applyRemoteFlows } = setup([base], { storage });
    await advance(10);
    rerender({ sessions: [base], enabled: false });
    rerender({ sessions: [{ ...base, serviceDate: 'June 3' }], enabled: false });
    await advance(EDIT_DEBOUNCE_MS + 10);
    expect(writes(requests)).toEqual([]);
    applyRemoteFlows.mockClear();
    rerender({ sessions: [{ ...base, serviceDate: 'June 3' }], enabled: true });
    await advance(EDIT_DEBOUNCE_MS + 10);
    expect(writes(requests)).toEqual([{ method: 'PATCH', path: `/flows/${FLOW}`, body: { serviceDate: 'June 3' } }]);
    expect(applyRemoteFlows.mock.calls[0][2]).toEqual({ [FLOW]: ['serviceDate'] });
  });

  it('finds an edit made while the app was closed (saved baseline)', async () => {
    const requests = mockFetch(serverWithFlow);
    const storage = memoryStorage();
    const base = session();
    const first = setup([base], { storage });
    await advance(10);
    first.unmount();
    setup([{ ...base, personName: 'Margaret Ann Hayes' }], { storage });
    await advance(EDIT_DEBOUNCE_MS + 10);
    expect(writes(requests)).toEqual([
      { method: 'PATCH', path: `/flows/${FLOW}`, body: { personName: 'Margaret Ann Hayes' } },
    ]);
  });

  it('keeps each account\'s queue when signing in as someone else and back (A, B, A)', async () => {
    let online = true;
    const requests = mockFetch((req) => (online ? serverWithFlow(req) : 'offline'));
    const storage = memoryStorage();
    const base = session();
    const { rerender } = setup([base], { storage });
    await advance(10);
    online = false;
    rerender({ sessions: [{ ...base, serviceDate: 'June 3' }] });
    await advance(EDIT_DEBOUNCE_MS + 10);
    expect(JSON.parse(storage.data.get(flowQueueKey(USER)) ?? '{}').queue[FLOW]).toEqual({ serviceDate: 'June 3' });

    rerender({ sessions: [{ ...base, serviceDate: 'June 3' }], userId: OTHER });
    await advance(10);
    expect(storage.data.get(flowQueueKey(OTHER))).toBeUndefined();
    expect(JSON.parse(storage.data.get(flowQueueKey(USER)) ?? '{}').queue[FLOW]).toEqual({ serviceDate: 'June 3' });

    online = true;
    rerender({ sessions: [{ ...base, serviceDate: 'June 3' }], userId: USER });
    await advance(EDIT_DEBOUNCE_MS + 10);
    expect(writes(requests).at(-1)).toEqual({
      method: 'PATCH',
      path: `/flows/${FLOW}`,
      body: { serviceDate: 'June 3' },
    });
  });

  it('keeps a local edit through a pull with an older server value (real useSessions)', async () => {
    let flowId = '';
    let serverName = 'Margaret';
    const requests = mockFetch((req) => {
      if (req.method === 'GET') return { status: 200, body: [record({ personName: serverName }, USER, flowId)] };
      return 'offline';
    });
    const wakes = new Set<() => void>();
    const view = renderHook(
      (props: { enabled: boolean }) => {
        const s = useSessions();
        useFlowSync({
          sessions: s.sessions,
          userId: USER,
          getAccessToken: async () => 'tok',
          enabled: props.enabled,
          subscribe: (fn) => {
            wakes.add(fn);
            return () => void wakes.delete(fn);
          },
          applyRemoteFlows: s.applyRemoteFlows,
        });
        return s;
      },
      { initialProps: { enabled: false } },
    );
    act(() => {
      view.result.current.createSession({ personName: 'Margaret' });
    });
    flowId = view.result.current.sessions[0].flowId;
    view.rerender({ enabled: true });
    await advance(10);
    act(() => view.result.current.updateSession(view.result.current.sessions[0].id, { personName: 'Margaret Ann' }));
    await advance(EDIT_DEBOUNCE_MS + 10);
    expect(writes(requests).length).toBeGreaterThan(0); // the send failed, so the edit is pending
    serverName = 'Old Name';
    await act(async () => wakes.forEach((fn) => fn()));
    await advance(10);
    expect(view.result.current.sessions[0].personName).toBe('Margaret Ann');
  });
});

describe('useFlowSync queue behaviour', () => {
  it('goes on to the next person after a failure that is not an outage (413)', async () => {
    const OTHER_FLOW = '44444444-4444-4444-8444-444444444444';
    const requests = mockFetch((req) => {
      if (req.method === 'GET') return { status: 200, body: [record(), record({}, USER, OTHER_FLOW)] };
      return req.path.endsWith(FLOW) ? { status: 413 } : { status: 200, body: record({}, USER, OTHER_FLOW) };
    });
    const a = session();
    const b = session({ id: 's2', flowId: OTHER_FLOW });
    const { rerender, result } = setup([a, b]);
    await advance(10);
    rerender({ sessions: [{ ...a, serviceDate: 'x' }, { ...b, serviceDate: 'y' }] });
    await advance(EDIT_DEBOUNCE_MS + 10);
    expect(writes(requests).map((r) => r.path)).toEqual([`/flows/${FLOW}`, `/flows/${OTHER_FLOW}`]);
    expect(result.current.lastError).toBe('failed');
  });

  it('backs off and retries when there is no token yet, with no edit or wake', async () => {
    const requests = mockFetch(serverWithFlow);
    let token: string | null = null;
    renderHook(() =>
      useFlowSync({
        sessions: [session()],
        userId: USER,
        getAccessToken: async () => token,
        enabled: true,
        subscribe: () => () => undefined,
        applyRemoteFlows: vi.fn(),
      }),
    );
    await advance(10);
    expect(requests).toEqual([]);
    token = 'tok';
    await advance(BACKOFF_START_MS + 10);
    expect(gets(requests).length).toBe(1);
  });

  it('sends an edit made during an in-flight request next, and does not clear it', async () => {
    let release: (reply: Reply) => void = () => undefined;
    let first = true;
    const requests = mockFetch((req) => {
      if (req.method === 'GET') return { status: 200, body: [record()] };
      if (first) {
        first = false;
        return new Promise<Reply>((resolve) => (release = resolve));
      }
      return { status: 200, body: record() };
    });
    const base = session();
    const { rerender } = setup([base]);
    await advance(10);
    rerender({ sessions: [{ ...base, serviceDate: 'A' }] });
    await advance(EDIT_DEBOUNCE_MS + 10);
    expect(writes(requests).map((r) => r.body)).toEqual([{ serviceDate: 'A' }]);
    rerender({ sessions: [{ ...base, serviceDate: 'B' }] });
    await advance(EDIT_DEBOUNCE_MS + 10);
    release({ status: 200, body: record() });
    await advance(10);
    expect(writes(requests).map((r) => r.body)).toEqual([{ serviceDate: 'A' }, { serviceDate: 'B' }]);
  });

  it('makes no requests with an empty userId', async () => {
    const requests = mockFetch(serverWithFlow);
    const base = session();
    const { rerender, wake } = setup([base], { userId: '' });
    rerender({ sessions: [{ ...base, serviceDate: 'x' }], userId: '' });
    wake();
    await advance(EDIT_DEBOUNCE_MS + PULL);
    expect(requests).toEqual([]);
  });

  it('aborts a request in flight on unmount (#164)', async () => {
    mockFetch((req) => (req.method === 'GET' ? 'hang' : { status: 200 }));
    const { unmount } = setup([session()]);
    await advance(10);
    expect(signals[0]?.aborted).toBe(false);
    unmount();
    expect(signals[0]?.aborted).toBe(true);
    await advance(REQUEST_TIMEOUT_MS + BACKOFF_MAX_MS);
  });

  it('makes no requests after unmount', async () => {
    const requests = mockFetch((req) => (req.method === 'GET' ? 'hang' : { status: 200 }));
    const { unmount, wake } = setup([session()]);
    await advance(10);
    unmount();
    const count = requests.length;
    wake();
    await advance(PULL + BACKOFF_MAX_MS);
    expect(requests.length).toBe(count);
  });
});

describe('useFlowSync removed people (#215)', () => {
  it('never sends a queued edit for a person who was removed', async () => {
    const requests = mockFetch(serverWithFlow);
    const storage = memoryStorage();
    const base = session();
    const { rerender } = setup([base], { storage });
    await advance(10);
    // The edit is noticed, then the person is removed before the debounce ends.
    rerender({ sessions: [{ ...base, serviceDate: 'June 3' }] });
    rerender({ sessions: [] });
    await advance(EDIT_DEBOUNCE_MS + 10);
    expect(writes(requests)).toEqual([]);
    const saved = JSON.parse(storage.data.get(flowQueueKey(USER)) ?? '{}');
    expect(saved.queue).toEqual({});
    expect(saved.baselines).toEqual({});
    expect(saved.removed).toEqual([FLOW]);
  });

  it('does not bring the person back when a pull still returns them, then forgets the id', async () => {
    const requests = mockFetch(serverWithFlow);
    const storage = memoryStorage();
    const { rerender, applyRemoteFlows, wake } = setup([session()], { storage });
    await advance(10);
    rerender({ sessions: [] });
    await advance(10);
    await wake();
    await advance(10);
    const last = applyRemoteFlows.mock.calls.at(-1);
    expect(last?.[0].flows).toEqual([]);
    expect(writes(requests)).toEqual([]);

    mockFetch(() => ({ status: 200, body: [] }));
    await wake();
    await advance(10);
    expect(JSON.parse(storage.data.get(flowQueueKey(USER)) ?? '{}').removed).toEqual([]);
  });

  it('keeps a removed id across a reload', async () => {
    mockFetch(serverWithFlow);
    const storage = memoryStorage();
    const first = setup([session()], { storage });
    await advance(10);
    first.rerender({ sessions: [] });
    await advance(10);
    first.unmount();
    const second = setup([], { storage });
    await advance(10);
    expect(second.applyRemoteFlows.mock.calls.at(-1)?.[0].flows).toEqual([]);
  });

  it('works with the real useSessions.removeSession', async () => {
    const requests = mockFetch(serverWithFlow);
    const storage = memoryStorage();
    const sessionsStore = memoryStorage({ 'gg.sessions.v1': JSON.stringify([session()]) });
    const view = renderHook(() => {
      const s = useSessions(sessionsStore);
      useFlowSync({
        sessions: s.sessions,
        userId: USER,
        getAccessToken: async () => 'tok',
        enabled: true,
        storage,
        subscribe: () => () => undefined,
        applyRemoteFlows: s.applyRemoteFlows,
      });
      return s;
    });
    await advance(10);
    act(() => void view.result.current.removeSession('s1'));
    await advance(PULL + 10);
    expect(view.result.current.sessions).toEqual([]);
    expect(writes(requests)).toEqual([]);
  });
});
