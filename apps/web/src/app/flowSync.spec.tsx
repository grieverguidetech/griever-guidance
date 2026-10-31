/**
 * #520: background sync wired into the real App. Runs only with the editor flag, the sync flag and
 * a signed-in user. fetch is stubbed, so no network. Flags are mocked per test.
 */
import { render, screen, waitFor, within } from '@testing-library/react';
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
      const body = method === 'GET' ? [record] : record;
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
      fullName: null,
      birthDate: null,
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
});
