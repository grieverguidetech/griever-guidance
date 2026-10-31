/**
 * #51 with the auth flag on and a fake Clerk (no network, no Clerk). Covers the signed-in path,
 * a sign-out Clerk cannot finish offline, and the "accounts can't be reached, but a marker is
 * stored" path.
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ClerkLoadResult } from '../lib/authClient';
import { fakeClerk } from '../test-clerk';

const mocks = vi.hoisted(() => ({ loadClerk: vi.fn<() => Promise<ClerkLoadResult>>(), getProfile: vi.fn() }));

vi.mock('../lib/features', () => ({ AUTH_ENABLED: true, OBITUARY_DRAFTING_ENABLED: false, SHARING_ENABLED: false }));
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

const LOCAL_SESSION = {
  id: 's1',
  personName: 'Margaret Hayes',
  dateOfPassing: '',
  senderName: 'Anna',
  createdAt: '2026-10-10T00:00:00.000Z',
  lastOpenedAt: '2026-10-10T00:00:00.000Z',
  draft: null,
  drafts: {},
  serviceReady: false,
  recipientsNotified: {},
  momentCompletedAt: {},
  remindersScheduled: [],
};
const REMOVED = 'Everything has been removed from this device.';

function seedDevice() {
  window.localStorage.setItem('gg.signedIn.v1', 'u1');
  window.localStorage.setItem('gg.sessions.v1', JSON.stringify([LOCAL_SESSION]));
  window.localStorage.setItem('gg.profile.v1', JSON.stringify({ id: 'u1', senderName: 'Anna', contactSource: null }));
}

async function removeFromSettings(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: 'Settings' }));
  await user.click(screen.getByRole('button', { name: 'Remove everything from this device' }));
  await user.click(screen.getByRole('button', { name: 'Remove everything' }));
}

beforeEach(() => {
  mocks.loadClerk.mockReset();
  mocks.getProfile.mockReset();
  // The seeded device is Anna's account, which has a name: the boot-time name check must not interrupt Settings.
  mocks.getProfile.mockResolvedValue({
    ok: true,
    profile: {
      id: 'u1',
      senderName: 'Anna',
      contactSource: null,
      fullName: null,
      birthDate: null,
      accountType: 'owner',
      createdAt: '2026-10-11T00:00:00.000Z',
      updatedAt: '2026-10-11T00:00:00.000Z',
    },
  });
  window.localStorage.clear();
});

describe('remove everything from this device, auth on (#51)', () => {
  it('signs out, empties the device and lands on sign-in with the note', async () => {
    const signOut = vi.fn(async () => undefined);
    mocks.loadClerk.mockResolvedValue(fakeClerk({ userId: 'u1', signOut }).load);
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    seedDevice();
    await contactStore.put({ contactId: 'c1' } as never);

    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Settings' }));
    await user.click(screen.getByRole('button', { name: 'Remove everything from this device' }));
    expect(screen.getByText(/You'll be signed out on this device\./)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Remove everything' }));

    expect(await screen.findByRole('button', { name: 'Sign in with the test provider' })).toBeInTheDocument();
    expect(signOut).toHaveBeenCalledOnce();
    expect(window.localStorage.getItem('gg.profile.v1')).toBeNull();
    expect(window.localStorage.getItem('gg.signedIn.v1')).toBeNull();
    expect(window.localStorage.getItem('gg.signOutPending')).toBeNull();
    expect(await contactStore.list()).toHaveLength(0);
    await waitFor(() => expect(screen.getAllByText(REMOVED).length).toBeGreaterThan(0));
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('still empties the device and marks the sign-out pending when Clerk cannot end the session', async () => {
    const signOut = vi.fn(() => Promise.reject(new Error('offline')));
    mocks.loadClerk.mockResolvedValue(fakeClerk({ userId: 'u1', signOut }).load);
    seedDevice();
    await contactStore.put({ contactId: 'c1' } as never);

    const user = userEvent.setup();
    render(<App />);
    await removeFromSettings(user);

    await waitFor(() => expect(screen.getAllByText(REMOVED).length).toBeGreaterThan(0));
    expect(await contactStore.list()).toHaveLength(0);
    expect(window.localStorage.getItem('gg.sessions.v1') ?? '[]').toBe('[]');
    expect(window.localStorage.getItem('gg.signedIn.v1')).toBeNull();
    expect(window.localStorage.getItem('gg.signOutPending')).toBe('1');
  });

  it('restarts when accounts cannot be reached but the signed-in marker is stored (offline)', async () => {
    mocks.loadClerk.mockResolvedValue({ available: false });
    seedDevice();
    await contactStore.put({ contactId: 'c1' } as never);

    const user = userEvent.setup();
    render(<App />);
    await removeFromSettings(user);

    expect(await screen.findByRole('heading', { name: "Accounts aren't available right now" })).toBeInTheDocument();
    expect(await contactStore.list()).toHaveLength(0);
    expect(window.localStorage.getItem('gg.signedIn.v1')).toBeNull();
    // Give any stale hook the chance to save again; nothing may bring the data back.
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(window.localStorage.getItem('gg.sessions.v1')).toBeNull();
    await waitFor(() => expect(screen.getAllByText(REMOVED).length).toBeGreaterThan(0));
  });
});
