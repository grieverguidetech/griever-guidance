/**
 * #222: "Remove a person" on Account, in the real App. The api-client is mocked, so no network.
 * Synced people go through deleteFlow first; device-only people never send a request.
 */
import { act, screen, waitFor, within } from '@testing-library/react';
import { renderApp } from '../test/renderApp';
import userEvent from '@testing-library/user-event';
import type { ClerkLoadResult } from '../lib/authClient';
import { fakeClerk } from '../test-clerk';

const USER = 'u1';
const FLOW_A = '22222222-2222-4222-8222-222222222222';
const FLOW_B = '33333333-3333-4333-8333-333333333333';
const FLOW_M = '44444444-4444-4444-8444-444444444444';

const mocks = vi.hoisted(() => ({
  auth: true,
  loadClerk: vi.fn<() => Promise<ClerkLoadResult>>(),
  getProfile: vi.fn(),
  deleteFlow: vi.fn(),
  listFlows: vi.fn(),
}));

vi.mock('../lib/features', () => ({
  get AUTH_ENABLED() {
    return mocks.auth;
  },
  OBITUARY_DRAFTING_ENABLED: false,
  PAYMENTS_ENABLED: false,
  SHARING_ENABLED: false,
}));
vi.mock('../lib/cmsFlag', () => ({ CMS_ENABLED: true }));
vi.mock('../lib/syncFlag', () => ({ SYNC_ENABLED: true }));
vi.mock('../lib/authClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/authClient')>();
  return { ...actual, loadClerk: mocks.loadClerk };
});
vi.mock('@griever/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@griever/api-client')>();
  const quiet = async () => ({ ok: false, reason: 'offline' });
  return { ...actual, getProfile: mocks.getProfile, deleteFlow: mocks.deleteFlow, listFlows: mocks.listFlows, createFlow: quiet, patchFlow: quiet };
});

import { App } from './app';

function person(id: string, flowId: string, name: string, extra: Record<string, unknown>) {
  return {
    id,
    flowId,
    ownerId: null,
    role: 'owner',
    personName: name,
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
    ...extra,
  };
}

function seed(list: Record<string, unknown>[]) {
  window.localStorage.setItem('gg.signedIn.v1', USER);
  window.localStorage.setItem('gg.sessionsAccount.v1', USER);
  window.localStorage.setItem('gg.sessions.v1', JSON.stringify(list));
}

const synced = [
  person('s1', FLOW_A, 'Margaret Hayes', { ownerId: USER }),
  person('s2', FLOW_B, 'Robert Hayes', { ownerId: USER, lastOpenedAt: '2026-10-09T00:00:00.000Z' }),
  person('s3', FLOW_M, 'Shared Sam', { ownerId: 'someone_else', role: 'member' }),
];

async function openAccount(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('link', { name: 'Your account' }));
  await screen.findByRole('heading', { level: 1, name: 'Account' });
}

async function startOnOverview() {
  const user = userEvent.setup();
  renderApp(<App />);
  const open = await screen.findByRole('button', { name: 'Margaret Hayes' }).catch(() => null);
  if (open) {
    await user.click(open);
  }
  await screen.findByRole('heading', { level: 1, name: 'Overview' });
  await openAccount(user);
  return user;
}

beforeEach(() => {
  mocks.auth = true;
  mocks.loadClerk.mockReset();
  mocks.getProfile.mockReset();
  mocks.deleteFlow.mockReset();
  mocks.listFlows.mockReset();
  mocks.listFlows.mockResolvedValue({ ok: false, reason: 'offline' });
  mocks.getProfile.mockResolvedValue({
    ok: true,
    profile: { id: USER, senderName: 'Anna', contactSource: null, firstName: null, lastName: null, fullName: null, birthDate: null, address: null, accountType: 'owner', createdAt: '2026-10-11T00:00:00.000Z', updatedAt: '2026-10-11T00:00:00.000Z' },
  });
  mocks.loadClerk.mockResolvedValue(fakeClerk({ userId: USER }).load);
  window.localStorage.clear();
});

describe('Remove a person on Account (#222)', () => {
  it('Account is /account, and the remove confirm step has no URL and adds no history entry (C9, #850)', async () => {
    seed(synced);
    const user = await startOnOverview();
    expect(window.location.pathname).toBe('/account');
    const entries = window.history.length;
    await user.click(screen.getByRole('button', { name: 'Remove Robert Hayes' }));
    expect(screen.getByRole('button', { name: 'Yes, remove Robert Hayes' })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/account');
    expect(window.location.search + window.location.hash).toBe('');
    expect(window.history.length).toBe(entries);
    await user.click(screen.getByRole('button', { name: 'Keep Robert Hayes' }));
    expect(window.history.length).toBe(entries);
  });

  it('a deep link to /account opens the signed-in Account', async () => {
    seed(synced);
    renderApp(<App />, { path: '/account' });
    expect(await screen.findByRole('heading', { level: 1, name: 'Account' })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Remove Margaret Hayes' })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/account');
  });

  it('signed in and synced: removes one of two people after the server says ok, and never lists a member', async () => {
    seed(synced);
    mocks.deleteFlow.mockResolvedValue({ ok: true });
    const user = await startOnOverview();
    expect(screen.getByRole('button', { name: 'Remove Margaret Hayes' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove Robert Hayes' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remove Shared Sam' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Remove Robert Hayes' }));
    await user.click(screen.getByRole('button', { name: 'Yes, remove Robert Hayes' }));

    expect(await screen.findByText('Robert Hayes has been removed.')).toBeInTheDocument();
    expect(mocks.deleteFlow).toHaveBeenCalledTimes(1);
    expect(mocks.deleteFlow).toHaveBeenCalledWith('tok', FLOW_B, expect.any(AbortSignal));
    expect(screen.queryByRole('button', { name: 'Remove Robert Hayes' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove Margaret Hayes' })).toBeInTheDocument();
    const stored = JSON.parse(window.localStorage.getItem('gg.sessions.v1') ?? '[]') as { id: string }[];
    expect(stored.map((s) => s.id)).not.toContain('s2');
  });

  it('a person the server no longer has (not_found) is removed here', async () => {
    seed(synced);
    mocks.deleteFlow.mockResolvedValue({ ok: false, reason: 'not_found' });
    const user = await startOnOverview();
    await user.click(screen.getByRole('button', { name: 'Remove Robert Hayes' }));
    await user.click(screen.getByRole('button', { name: 'Yes, remove Robert Hayes' }));
    expect(await screen.findByText('Robert Hayes has been removed.')).toBeInTheDocument();
  });

  it('offline keeps the person and shows the offline line', async () => {
    seed(synced);
    mocks.deleteFlow.mockResolvedValue({ ok: false, reason: 'offline' });
    const user = await startOnOverview();
    await user.click(screen.getByRole('button', { name: 'Remove Robert Hayes' }));
    await user.click(screen.getByRole('button', { name: 'Yes, remove Robert Hayes' }));
    expect(await screen.findByText('You need a connection to remove Robert Hayes. Nothing has changed.')).toBeInTheDocument();
    const stored = JSON.parse(window.localStorage.getItem('gg.sessions.v1') ?? '[]') as { id: string }[];
    expect(stored.map((s) => s.id)).toContain('s2');
  });

  it('a 503 keeps the person and shows the failed line', async () => {
    seed(synced);
    mocks.deleteFlow.mockResolvedValue({ ok: false, reason: 'unavailable' });
    const user = await startOnOverview();
    await user.click(screen.getByRole('button', { name: 'Remove Robert Hayes' }));
    await user.click(screen.getByRole('button', { name: 'Yes, remove Robert Hayes' }));
    expect(await screen.findByText(/We could not remove Robert Hayes just now/)).toBeInTheDocument();
    const stored = JSON.parse(window.localStorage.getItem('gg.sessions.v1') ?? '[]') as { id: string }[];
    expect(stored.map((s) => s.id)).toContain('s2');
    expect(screen.getByRole('button', { name: 'Yes, remove Robert Hayes' })).toBeInTheDocument();
  });

  it('accounts off: removes the person on this device and sends no request', async () => {
    mocks.auth = false;
    seed([person('s1', FLOW_A, 'Margaret Hayes', {}), person('s2', FLOW_B, 'Robert Hayes', { lastOpenedAt: '2026-10-09T00:00:00.000Z' })]);
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    try {
      const user = await startOnOverview();
      const panel = screen.getByRole('heading', { name: 'Remove a person' }).closest('section') as HTMLElement;
      await user.click(within(panel).getByRole('button', { name: 'Remove Robert Hayes' }));
      expect(within(panel).getByText(/from this device/)).toBeInTheDocument();
      await user.click(within(panel).getByRole('button', { name: 'Yes, remove Robert Hayes' }));
      await waitFor(() => expect(screen.getByText('Robert Hayes has been removed.')).toBeInTheDocument());
      expect(mocks.deleteFlow).not.toHaveBeenCalled();
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('accounts unreachable (offline mode): account-tied people are not listed and the hint shows', async () => {
    seed([...synced.slice(0, 2), person('s4', '55555555-5555-4555-8555-555555555555', 'Device Dan', {})]);
    mocks.loadClerk.mockResolvedValue({ available: false } as unknown as ClerkLoadResult);
    const user = userEvent.setup();
    renderApp(<App />);
    await user.click(await screen.findByRole('button', { name: 'Device Dan' }));
    await screen.findByRole('heading', { level: 1, name: 'Overview' });
    await openAccount(user);
    expect(screen.getByRole('button', { name: 'Remove Device Dan' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remove Margaret Hayes' })).not.toBeInTheDocument();
    expect(screen.getByText('You need a connection to remove someone saved to your account.')).toBeInTheDocument();
  });

  it('signed out with accounts on: account-tied people are hidden and the note says to sign in', async () => {
    seed(synced.slice(0, 2));
    const clerk = fakeClerk({ userId: USER });
    mocks.loadClerk.mockResolvedValue(clerk.load);
    const user = userEvent.setup();
    renderApp(<App />);
    await user.click(await screen.findByRole('button', { name: 'Margaret Hayes' }));
    await screen.findByRole('heading', { level: 1, name: 'Overview' });
    // The session ends somewhere else; the person stays where they are.
    act(() => clerk.endElsewhere());
    await user.click(await screen.findByRole('link', { name: 'Your account' }));
    expect(await screen.findByText('Sign in to remove someone saved to your account.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remove Margaret Hayes' })).not.toBeInTheDocument();
  });

  it('a later pull that still returns the removed person does not bring them back', async () => {
    seed(synced);
    mocks.deleteFlow.mockResolvedValue({ ok: true });
    const user = await startOnOverview();
    await user.click(screen.getByRole('button', { name: 'Remove Robert Hayes' }));
    await user.click(screen.getByRole('button', { name: 'Yes, remove Robert Hayes' }));
    await screen.findByText('Robert Hayes has been removed.');

    const record = (id: string, name: string) => ({
      id,
      ownerId: USER,
      role: 'owner',
      facts: { personName: name, dateOfPassing: null, serviceDate: null, obituaryUrl: null, obituaryPublisher: null, serviceReady: false },
      updatedAt: '2026-10-12T00:00:00.000Z',
      updatedBy: null,
    });
    mocks.listFlows.mockResolvedValue({ ok: true, flows: [record(FLOW_A, 'Margaret Hayes'), record(FLOW_B, 'Robert Hayes')], dropped: 0 });
    const before = mocks.listFlows.mock.calls.length;
    window.dispatchEvent(new Event('focus'));
    await waitFor(() => expect(mocks.listFlows.mock.calls.length).toBeGreaterThan(before));
    await new Promise((r) => setTimeout(r, 200));

    expect(screen.queryByRole('button', { name: 'Remove Robert Hayes' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove Margaret Hayes' })).toBeInTheDocument();
    const stored = JSON.parse(window.localStorage.getItem('gg.sessions.v1') ?? '[]') as { flowId: string }[];
    expect(stored.map((s) => s.flowId)).not.toContain(FLOW_B);
  });
});
