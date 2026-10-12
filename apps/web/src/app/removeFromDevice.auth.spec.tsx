/**
 * #51 with the auth flag on: a stub auth client (no network, no supabase-js). Covers the signed-in
 * path and the "accounts can't be reached, but a session is stored" path.
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AuthClient } from '@griever/api-client/auth';
import type { AuthClientResult } from '../lib/authClient';

const mocks = vi.hoisted(() => ({ load: vi.fn<() => Promise<AuthClientResult>>() }));

vi.mock('../lib/features', () => ({ AUTH_ENABLED: true, OBITUARY_DRAFTING_ENABLED: false }));
vi.mock('../lib/authClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/authClient')>();
  return { ...actual, loadAuthClient: mocks.load };
});

import { contactStore } from '@griever/data-local';
import { App } from './app';

const SESSION_JSON = JSON.stringify({ access_token: 'a', refresh_token: 'r', user: { id: 'u1' } });
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
  window.localStorage.setItem('sb-abcdef-auth-token', SESSION_JSON);
  window.localStorage.setItem('gg.sessions.v1', JSON.stringify([LOCAL_SESSION]));
  window.localStorage.setItem('gg.profile.v1', JSON.stringify({ id: 'u1', senderName: 'Anna', contactSource: null }));
}

async function removeFromSettings(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: 'Settings' }));
  await user.click(screen.getByRole('button', { name: 'Remove everything from this device' }));
  await user.click(screen.getByRole('button', { name: 'Remove everything' }));
}

beforeEach(() => {
  mocks.load.mockReset();
});

describe('remove everything from this device, auth on (#51)', () => {
  it('signs out locally, empties the device and lands on sign-up with the note', async () => {
    let signedIn = true;
    const signOut = vi.fn(async () => {
      signedIn = false;
      return { ok: true as const, serverRevoked: false };
    });
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const client = {
      signOut,
      getSession: vi.fn(async () =>
        signedIn
          ? { status: 'signed_in' as const, session: { userId: 'u1', email: 'a@b.co', accessToken: 't' } }
          : { status: 'signed_out' as const },
      ),
      refreshSession: vi.fn(async () => ({ status: 'signed_out' as const })),
      getProfile: vi.fn(async () => ({ ok: false as const, reason: 'no_profile' as const })),
    } as unknown as AuthClient;
    mocks.load.mockResolvedValue({ available: true, client });
    seedDevice();
    await contactStore.put({ contactId: 'c1' } as never);

    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Settings' }));
    await user.click(screen.getByRole('button', { name: 'Remove everything from this device' }));
    expect(screen.getByText(/You'll be signed out on this device\./)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Remove everything' }));

    expect(await screen.findByLabelText('Password')).toBeInTheDocument();
    expect(signOut).toHaveBeenCalledOnce();
    expect(window.localStorage.getItem('sb-abcdef-auth-token')).toBeNull();
    expect(window.localStorage.getItem('gg.profile.v1')).toBeNull();
    expect(await contactStore.list()).toHaveLength(0);
    await waitFor(() => expect(screen.getAllByText(REMOVED).length).toBeGreaterThan(0));
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('restarts when accounts cannot be reached but a session is stored (offline)', async () => {
    mocks.load.mockResolvedValue({ available: false });
    seedDevice();
    await contactStore.put({ contactId: 'c1' } as never);

    const user = userEvent.setup();
    render(<App />);
    await removeFromSettings(user);

    expect(await screen.findByRole('heading', { name: "Accounts aren't available right now" })).toBeInTheDocument();
    expect(await contactStore.list()).toHaveLength(0);
    expect(window.localStorage.getItem('sb-abcdef-auth-token')).toBeNull();
    // Give any stale hook the chance to save again; nothing may bring the data back.
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(window.localStorage.getItem('gg.sessions.v1')).toBeNull();
    await waitFor(() => expect(screen.getAllByText(REMOVED).length).toBeGreaterThan(0));
  });
});
