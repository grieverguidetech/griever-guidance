/**
 * #575 Delete account in the real App with a fake Clerk (no network). The fake's deleteAccount
 * ends the session on success, as Clerk does.
 */
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ClerkLoadResult } from '../lib/authClient';
import { fakeClerk } from '../test-clerk';

const USER = 'u1';
const FLOW = '22222222-2222-4222-8222-222222222222';

const mocks = vi.hoisted(() => ({
  loadClerk: vi.fn<() => Promise<ClerkLoadResult>>(),
  getProfile: vi.fn(),
}));

vi.mock('../lib/features', () => ({ AUTH_ENABLED: true, OBITUARY_DRAFTING_ENABLED: false, PAYMENTS_ENABLED: false, SHARING_ENABLED: false }));
vi.mock('../lib/cmsFlag', () => ({ CMS_ENABLED: true }));
vi.mock('../lib/syncFlag', () => ({ SYNC_ENABLED: true }));
vi.mock('../lib/authClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/authClient')>();
  return { ...actual, loadClerk: mocks.loadClerk };
});
vi.mock('@griever/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@griever/api-client')>();
  return { ...actual, getProfile: mocks.getProfile };
});

import { contactStore } from '@griever/data-local';
import { App } from './app';

const SIGNED_OUT_NOTE = "You've been signed out.";
let gets = 0;

function seed() {
  window.localStorage.setItem('gg.signedIn.v1', USER);
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

async function openConfirm(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: 'Margaret Hayes' }));
  await screen.findByRole('heading', { level: 1, name: 'Overview' });
  await user.click(screen.getByRole('button', { name: 'Your account' }));
  await screen.findByRole('heading', { level: 1, name: 'Your account' });
  await user.click(screen.getByRole('button', { name: 'Delete my account' }));
}

beforeEach(() => {
  gets = 0;
  mocks.loadClerk.mockReset();
  mocks.getProfile.mockReset();
  mocks.getProfile.mockResolvedValue({
    ok: true,
    profile: { id: USER, senderName: 'Anna', contactSource: null, fullName: null, birthDate: null, accountType: 'owner', createdAt: '2026-10-11T00:00:00.000Z', updatedAt: '2026-10-11T00:00:00.000Z' },
  });
  window.localStorage.clear();
  seed();
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if ((init?.method ?? 'GET') === 'GET') {
        gets += 1;
      }
      return new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } });
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('delete account in the app (#575)', () => {
  it('Clerk resolves: the done screen has focus, and sessions and contacts are empty', async () => {
    await contactStore.put({ contactId: 'c1' } as never);
    mocks.loadClerk.mockResolvedValue(fakeClerk({ userId: USER, deleteAccount: async () => undefined }).load);
    const user = userEvent.setup();
    render(<App />);
    await openConfirm(user);
    await user.click(screen.getByRole('button', { name: 'Yes, delete my account' }));
    const focused1 = await screen.findByRole('heading', { level: 1, name: 'Your account is deleted' });
    await waitFor(() => expect(focused1).toHaveFocus());
    expect(window.localStorage.getItem('gg.sessions.v1')).toBeNull();
    expect(await contactStore.list()).toHaveLength(0);
    expect(screen.queryByText(SIGNED_OUT_NOTE)).not.toBeInTheDocument();
  });

  it('Clerk rejects: a failure note, data kept, no done screen, sync back on', async () => {
    await contactStore.put({ contactId: 'c2' } as never);
    mocks.loadClerk.mockResolvedValue(fakeClerk({ userId: USER, deleteAccount: () => Promise.reject(new Error('not allowed')) }).load);
    const user = userEvent.setup();
    render(<App />);
    await openConfirm(user);
    await user.click(screen.getByRole('button', { name: 'Yes, delete my account' }));
    await waitFor(() => expect(screen.getByText(/We could not finish deleting your account/)).toBeInTheDocument());
    expect(screen.queryByRole('heading', { name: 'Your account is deleted' })).not.toBeInTheDocument();
    expect(window.localStorage.getItem('gg.sessions.v1')).not.toBeNull();
    expect(await contactStore.list()).toHaveLength(1);
    expect(screen.queryByText(SIGNED_OUT_NOTE)).not.toBeInTheDocument();
    // Sync is back on: a window focus pulls again.
    const before = gets;
    window.dispatchEvent(new Event('focus'));
    await waitFor(() => expect(gets).toBeGreaterThan(before));
    await contactStore.clearAll();
  });

  it('while Clerk is deleting: sync is off and the signed-out note never shows', async () => {
    let finish: () => void = () => undefined;
    const pending = new Promise<void>((resolve) => (finish = resolve));
    mocks.loadClerk.mockResolvedValue(fakeClerk({ userId: USER, deleteAccount: () => pending }).load);
    const user = userEvent.setup();
    render(<App />);
    await openConfirm(user);
    await waitFor(() => expect(gets).toBeGreaterThan(0));
    await user.click(screen.getByRole('button', { name: 'Yes, delete my account' }));
    const before = gets;
    window.dispatchEvent(new Event('focus'));
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(gets).toBe(before);
    expect(screen.queryByText(SIGNED_OUT_NOTE)).not.toBeInTheDocument();
    finish();
    await screen.findByRole('heading', { level: 1, name: 'Your account is deleted' });
    expect(within(document.body).queryByText(SIGNED_OUT_NOTE)).not.toBeInTheDocument();
  });
});
