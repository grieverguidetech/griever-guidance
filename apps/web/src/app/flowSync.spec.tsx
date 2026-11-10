/**
 * #520: background sync wired into the real App. Runs only with the editor flag, the sync flag and
 * a signed-in user. fetch is stubbed, so no network. Flags are mocked per test.
 */
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ClerkLoadResult } from '../lib/authClient';
import { fakeClerk } from '../test-clerk';

const USER = 'user_test';
const OWNER_UUID = '11111111-1111-4111-8111-111111111111';
const FLOW = '22222222-2222-4222-8222-222222222222';

const mocks = vi.hoisted(() => ({
  cms: true,
  sync: true,
  auth: true,
  loadClerk: vi.fn<() => Promise<ClerkLoadResult>>(),
  getProfile: vi.fn(),
}));

vi.mock('../lib/features', () => ({
  get AUTH_ENABLED() {
    return mocks.auth;
  },
  OBITUARY_DRAFTING_ENABLED: false,
  PAYMENTS_ENABLED: false,
  SHARING_ENABLED: false,
}));
vi.mock('../lib/cmsFlag', () => ({
  get CMS_ENABLED() {
    return mocks.cms;
  },
}));
vi.mock('../lib/syncFlag', () => ({
  get SYNC_ENABLED() {
    return mocks.sync;
  },
}));
vi.mock('../lib/authClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/authClient')>();
  return { ...actual, loadClerk: mocks.loadClerk };
});
vi.mock('@griever/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@griever/api-client')>();
  return { ...actual, getProfile: mocks.getProfile };
});

import { App } from './app';

interface Call {
  method: string;
  path: string;
  body: unknown;
}
let calls: Call[] = [];
let gatewayDown = false;
let serverHasNothing = false;

function stubGateway() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(String(input)).pathname;
      const method = init?.method ?? 'GET';
      calls.push({ method, path, body: init?.body ? JSON.parse(String(init.body)) : null });
      if (gatewayDown) {
        throw new TypeError('Failed to fetch');
      }
      const record = {
        id: FLOW,
        ownerId: OWNER_UUID,
        role: 'owner',
        facts: {
          personName: 'Margaret Hayes',
          dateOfPassing: null,
          serviceDate: null,
          obituaryUrl: null,
          obituaryPublisher: null,
          serviceReady: false,
        },
        updatedAt: '2026-10-01T00:00:00.000Z',
        updatedBy: null,
      };
      const body = method === 'GET' ? (serverHasNothing ? [] : [record]) : record;
      return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }),
  );
}

const flowCalls = () => calls.filter((c) => c.path.startsWith('/flows'));

function seed() {
  window.localStorage.setItem(
    'gg.sessions.v1',
    JSON.stringify([
      {
        id: 's1',
        flowId: FLOW,
        ownerId: null,
        role: 'owner',
        personName: 'Margaret Hayes',
        dateOfPassing: '',
        senderName: 'Anna',
        obituaryUrl: '',
        createdAt: '2026-10-10T00:00:00.000Z',
        lastOpenedAt: '2026-10-10T00:00:00.000Z',
        drafts: {},
        draftsUpdatedAt: {},
        serviceReady: false,
        recipientsNotified: {},
        momentCompletedAt: {},
        remindersScheduled: [],
      },
    ]),
  );
}

function signedIn(signed: boolean) {
  mocks.getProfile.mockResolvedValue({
    ok: true,
    profile: {
      id: USER,
      senderName: 'Anna',
      contactSource: null,
      firstName: null,
      lastName: null,
      fullName: null,
      birthDate: null,
      address: null,
      accountType: 'owner',
      createdAt: '2026-10-11T00:00:00.000Z',
      updatedAt: '2026-10-11T00:00:00.000Z',
    },
  });
  mocks.loadClerk.mockResolvedValue(fakeClerk(signed ? { userId: USER } : {}).load);
}

async function editName(text: string) {
  const user = userEvent.setup();
  await screen.findByRole('heading', { level: 1, name: 'Overview' });
  await user.click(within(screen.getByRole('main')).getByRole('button', { name: /^The person/ }));
  await screen.findByRole('heading', { level: 1, name: 'The person' });
  await user.type(screen.getByLabelText('Their name'), text);
}

beforeEach(() => {
  mocks.cms = true;
  mocks.sync = true;
  mocks.auth = true;
  gatewayDown = false;
  serverHasNothing = false;
  calls = [];
  mocks.loadClerk.mockReset();
  mocks.getProfile.mockReset();
  window.localStorage.clear();
  seed();
  stubGateway();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('background sync in the app (#520)', () => {
  it('signed in, editor on, sync on: an edit is sent as a PATCH after the debounce', async () => {
    signedIn(true);
    render(<App />);
    await editName(' Jr');
    await waitFor(() => expect(flowCalls().some((c) => c.method === 'PATCH')).toBe(true), { timeout: 5000 });
    const patch = flowCalls().find((c) => c.method === 'PATCH');
    expect(patch?.path).toBe(`/flows/${FLOW}`);
    expect(patch?.body).toMatchObject({ personName: 'Margaret Hayes Jr' });
    expect(Object.keys(patch?.body as object)).not.toContain('drafts');
  });

  it('pulls again when the window gets focus', async () => {
    signedIn(true);
    render(<App />);
    await screen.findByRole('heading', { level: 1, name: 'Overview' });
    await waitFor(() => expect(flowCalls().filter((c) => c.method === 'GET')).toHaveLength(1));
    window.dispatchEvent(new Event('focus'));
    await waitFor(() => expect(flowCalls().filter((c) => c.method === 'GET').length).toBeGreaterThan(1));
  });

  it('a fresh device lands on Overview when the first sync brings people (#566)', async () => {
    window.localStorage.removeItem('gg.sessions.v1');
    signedIn(true);
    render(<App />);
    expect(await screen.findByRole('heading', { level: 1, name: 'Overview' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 1, name: 'Your people' })).not.toBeInTheDocument();
    expect(screen.getAllByText('Margaret Hayes').length).toBeGreaterThan(0);
  });

  it('a fresh device waits at most 1.5 s for the first sync: loading at 1400 ms, the empty Overview at 1600 ms (#566, #603)', async () => {
    window.localStorage.removeItem('gg.sessions.v1');
    signedIn(true);
    // The server never answers; the landing must not wait on it past the cap.
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => undefined)));
    vi.useFakeTimers({ shouldAdvanceTime: false });
    try {
      render(<App />);
      // Let Clerk and the profile resolve without moving the clock.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1300);
      });
      // 1400 ms in: still the quiet loading status, not an empty list.
      expect(screen.queryByRole('heading', { level: 1, name: 'Your people' })).not.toBeInTheDocument();
      expect(screen.getByText('Loading…')).toBeInTheDocument();
      expect(screen.getAllByRole('banner')).toHaveLength(1);
      expect(screen.getAllByRole('navigation', { name: /^Sections/ })).toHaveLength(1);
      expect(screen.getAllByRole('main')).toHaveLength(1);
      expect(screen.getAllByRole('complementary')).toHaveLength(1);
      expect(document.querySelector('[aria-current]')).toBeNull();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(200);
      });
      expect(screen.getByRole('heading', { level: 1, name: 'Overview' })).toBeInTheDocument();
      expect(screen.queryByRole('heading', { level: 1, name: 'Your people' })).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('during the first-sync wait the nav is full, a section offers no Start button, and Start appears once the wait ends (#597)', async () => {
    window.localStorage.removeItem('gg.sessions.v1');
    signedIn(true);
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => undefined)));
    vi.useFakeTimers({ shouldAdvanceTime: false });
    try {
      render(<App />);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(500);
      });
      expect(screen.getByText('Loading…')).toBeInTheDocument();
      const nav = within(screen.getByRole('navigation', { name: /^Sections/ }));
      expect(nav.getAllByRole('button')).toHaveLength(7);
      expect(screen.getByRole('complementary', { name: "What you'll need" }).querySelector('[data-checklist-item]')).not.toBeNull();
      await act(async () => {
        nav.getByRole('button', { name: /^Obituary/ }).click();
      });
      expect(screen.getByRole('heading', { level: 1, name: 'Obituary' })).toBeInTheDocument();
      expect(screen.getByText('One moment. We are checking your account for people.')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: "Start with someone I've lost" })).toBeNull();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1600);
      });
      expect(screen.getByRole('button', { name: "Start with someone I've lost" })).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('a person arriving from the first sync while a section is empty opens in the same section, with a polite note and no focus jump (#597)', async () => {
    window.localStorage.removeItem('gg.sessions.v1');
    signedIn(true);
    let answer: (response: Response) => void = () => undefined;
    const record = {
      id: FLOW,
      ownerId: OWNER_UUID,
      role: 'owner',
      facts: { personName: 'Margaret Hayes', dateOfPassing: null, serviceDate: null, obituaryUrl: null, obituaryPublisher: null, serviceReady: false },
      updatedAt: '2026-10-01T00:00:00.000Z',
      updatedBy: null,
    };
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((resolve) => (answer = resolve))));
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText('Loading…');
    await user.click(within(screen.getByRole('navigation', { name: /^Sections/ })).getByRole('button', { name: /^Obituary/ }));
    const heading = await screen.findByRole('heading', { level: 1, name: 'Obituary' });
    const other = screen.getByRole('button', { name: "What you'll need" });
    other.focus();
    await act(async () => {
      answer(new Response(JSON.stringify([record]), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    });
    await waitFor(() => expect(screen.getByLabelText(/Given name/)).toHaveValue('Margaret'));
    expect(screen.getByRole('heading', { level: 1, name: 'Obituary' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: "Start with someone I've lost" })).toBeNull();
    expect(screen.getByText('A person is here now. Their page is open.')).toBeInTheDocument();
    expect(heading).not.toHaveFocus();
    expect(other).toHaveFocus();
  });

  it('Your account opens during a sync that never answers, and the landing does not pull it away (#584)', async () => {
    window.localStorage.removeItem('gg.sessions.v1');
    signedIn(true);
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => undefined)));
    vi.useFakeTimers({ shouldAdvanceTime: false });
    try {
      render(<App />);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000);
      });
      expect(screen.getByText('Loading…')).toBeInTheDocument();
      const nav = within(screen.getByRole('navigation', { name: /^Sections/ }));
      await act(async () => {
        nav.getByRole('button', { name: 'Your account' }).click();
      });
      expect(screen.getByRole('heading', { level: 1, name: 'Account' })).toBeInTheDocument();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2000);
      });
      expect(screen.getByRole('heading', { level: 1, name: 'Account' })).toBeInTheDocument();
      expect(screen.queryByRole('heading', { level: 1, name: 'Your people' })).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('a fresh device lands on the empty Overview at once when the first sync finds nobody (#566, #603)', async () => {
    window.localStorage.removeItem('gg.sessions.v1');
    serverHasNothing = true;
    signedIn(true);
    render(<App />);
    expect(await screen.findByRole('heading', { level: 1, name: 'Overview' }, { timeout: 1400 })).toBeInTheDocument();
  });

  it('makes no /flows calls with the editor off', async () => {
    mocks.cms = false;
    signedIn(true);
    render(<App />);
    // Signed in and loaded (the profile was asked for), so only the editor gate keeps sync off.
    await waitFor(() => expect(mocks.getProfile).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 1500));
    expect(flowCalls()).toEqual([]);
  });

  it('makes no /flows calls with sync off', async () => {
    mocks.sync = false;
    signedIn(true);
    render(<App />);
    await editName(' Jr');
    await new Promise((r) => setTimeout(r, 1500));
    expect(flowCalls()).toEqual([]);
  });

  it('makes no /flows calls when signed out, even with this device marked as signed in before', async () => {
    window.localStorage.setItem('gg.signedIn.v1', USER);
    signedIn(false);
    render(<App />);
    await screen.findByRole('heading', { level: 1 });
    await new Promise((r) => setTimeout(r, 1500));
    expect(flowCalls()).toEqual([]);
  });

  it('makes no /flows calls with accounts off, even after an edit', async () => {
    mocks.auth = false;
    window.localStorage.setItem('gg.signedIn.v1', USER);
    signedIn(true);
    render(<App />);
    await editName(' Jr');
    await new Promise((r) => setTimeout(r, 1500));
    expect(flowCalls()).toEqual([]);
  });

  it('gateway offline: no notice, and the editor still saves on the device', async () => {
    gatewayDown = true;
    signedIn(true);
    render(<App />);
    await editName(' Jr');
    await waitFor(() => expect(flowCalls().length).toBeGreaterThan(0), { timeout: 5000 });
    expect(screen.queryByText("This browser isn't saving right now. Keep this tab open, or copy anything important.")).toBeNull();
    for (const note of screen.queryAllByRole('status')) {
      expect(note.textContent).not.toMatch(/sync|offline|reach|connect/i);
    }
    expect(screen.queryByText(/sync|offline|couldn't reach/i)).toBeNull();
    const saved = JSON.parse(window.localStorage.getItem('gg.sessions.v1') ?? '[]');
    expect(saved[0].personName).toBe('Margaret Hayes Jr');
  });

  it('another account\'s unsynced person is never sent, nor shown, when a different account signs in', async () => {
    serverHasNothing = true;
    window.localStorage.setItem('gg.sessionsAccount.v1', 'user_previous');
    window.localStorage.setItem(
      'gg.sessions.v1',
      JSON.stringify([{ ...JSON.parse(window.localStorage.getItem('gg.sessions.v1') ?? '[]')[0], heldFor: 'user_previous' }]),
    );
    signedIn(true);
    render(<App />);
    await waitFor(() => expect(mocks.getProfile).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 1500));
    expect(flowCalls().filter((c) => c.method !== 'GET')).toEqual([]);
    expect(screen.queryByText(/Margaret Hayes/)).toBeNull();
    expect(window.localStorage.getItem('gg.sessionsStash.v1:user_previous')).toContain('Margaret Hayes');
  });

  it('with no earlier account on the device, a local person is adopted and sent', async () => {
    serverHasNothing = true;
    signedIn(true);
    render(<App />);
    await waitFor(() => expect(flowCalls().some((c) => c.method === 'POST' && c.path === '/flows')).toBe(true), { timeout: 5000 });
  });
});
