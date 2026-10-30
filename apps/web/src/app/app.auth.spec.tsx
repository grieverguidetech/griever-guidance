/**
 * The account flow on the real App with a fake Clerk (src/test-clerk.tsx): no network, no Clerk.
 * The feature flag and the Clerk loader are mocked so each test picks its own setup. The profile
 * calls are mocked at the api-client, which is where `useAccount` makes them.
 */
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ClerkLoadResult } from '../lib/authClient';
import { fakeClerk } from '../test-clerk';

const mocks = vi.hoisted(() => ({
  authEnabled: false,
  loadClerk: vi.fn<() => Promise<ClerkLoadResult>>(),
  getProfile: vi.fn(),
  updateProfile: vi.fn(),
}));

vi.mock('../lib/features', () => ({
  get AUTH_ENABLED() {
    return mocks.authEnabled;
  },
  OBITUARY_DRAFTING_ENABLED: false,
  PAYMENTS_ENABLED: false,
  SHARING_ENABLED: false,
}));
vi.mock('../lib/authClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/authClient')>();
  return { ...actual, loadClerk: mocks.loadClerk };
});
vi.mock('@griever/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@griever/api-client')>();
  return { ...actual, getProfile: mocks.getProfile, updateProfile: mocks.updateProfile };
});

import { App } from './app';

const PROFILE = {
  id: 'u1',
  senderName: 'Anna',
  contactSource: null,
  accountType: 'owner' as const,
  createdAt: '2026-10-11T00:00:00.000Z',
  updatedAt: '2026-10-11T00:00:00.000Z',
};
const HOME = "Who you're writing about";
const NOT_REACHABLE = "Your account can't be reached right now. Your work on this device is here.";
const ENDED = "You've been signed out. Your work on this device is safe. Sign in again when you're ready.";

const LOCAL_SESSION = {
  id: 's1',
  personName: 'Margaret Hayes',
  dateOfPassing: '',
  senderName: 'Anna',
  createdAt: '2026-10-10T00:00:00.000Z',
  lastOpenedAt: '2026-10-10T00:00:00.000Z',
  draft: {
    step: 'announce',
    templateCategory: 'announcement',
    templateOverrideId: null,
    fields: { personalNote: 'note kept on this device' },
    serviceDetailsKnown: null,
    selectedContactIds: [],
    includeFlowers: false,
    customFlorist: '',
    flowerDeliveryTarget: 'service',
    tone: 'plain',
    messageOverride: null,
  },
  serviceReady: false,
  recipientsNotified: {},
  momentCompletedAt: {},
  remindersScheduled: [],
};

function useClerk(options?: Parameters<typeof fakeClerk>[0]) {
  const clerk = fakeClerk(options);
  mocks.loadClerk.mockResolvedValue(clerk.load);
  return clerk;
}

async function signInFromScreen(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: 'Sign in with the test provider' }));
}

afterEach(() => {
  vi.useRealTimers();
});

beforeEach(() => {
  mocks.authEnabled = false;
  mocks.loadClerk.mockReset();
  mocks.getProfile.mockReset();
  mocks.updateProfile.mockReset();
  mocks.getProfile.mockResolvedValue({ ok: true, profile: PROFILE });
  mocks.updateProfile.mockImplementation(async (_token: string, update: { senderName?: string }) => ({
    ok: true,
    profile: { ...PROFILE, senderName: update.senderName ?? null },
  }));
  window.localStorage.clear();
});

describe('flag off', () => {
  it('shows Home and never loads Clerk', async () => {
    render(<App />);
    expect(screen.getByRole('heading', { level: 1, name: HOME })).toBeInTheDocument();
    await Promise.resolve();
    expect(mocks.loadClerk).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Sign in with the test provider' })).not.toBeInTheDocument();
  });
});

describe('flag on', () => {
  beforeEach(() => {
    mocks.authEnabled = true;
  });

  it('shows the sign-in screen first, then Home once signed in, without a token in the page', async () => {
    useClerk();
    const user = userEvent.setup();
    render(<App />);
    await signInFromScreen(user);
    expect(await screen.findByRole('heading', { level: 1, name: HOME })).toBeInTheDocument();
    expect(window.localStorage.getItem('gg.signedIn.v1')).toBe('u1');
    expect(document.body.textContent).not.toContain('tok');
  });

  it('does not move focus when a signed-in person cold-loads straight past sign-in (#50)', async () => {
    useClerk({ userId: 'u1' });
    render(<App />);
    await screen.findByRole('button', { name: 'Your account' });
    // With accounts on, the list lives on Your account, so Home has no link to it.
    expect(screen.queryByRole('button', { name: "What you'll need" })).not.toBeInTheDocument();
    await act(async () => {});
    expect(screen.queryByRole('button', { name: 'Sign in with the test provider' })).not.toBeInTheDocument();
    expect(document.activeElement).toBe(document.body);
  });

  it('signs in without waiting on the name check', async () => {
    mocks.getProfile.mockReturnValue(new Promise<never>(() => undefined));
    useClerk();
    const user = userEvent.setup();
    render(<App />);
    await signInFromScreen(user);
    expect(await screen.findByRole('heading', { name: HOME })).toBeInTheDocument();
  });

  it('asks for a name when the account has none', async () => {
    mocks.getProfile.mockResolvedValue({ ok: false, reason: 'no_profile' });
    useClerk({ userId: 'u1' });
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'What should we call you?' })).toBeInTheDocument();
  });

  it('saves the name with the adapter token and shows it saved', async () => {
    useClerk({ userId: 'u1' });
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Your account' }));
    const field = await screen.findByLabelText('Your name');
    await waitFor(() => expect(field).toHaveValue('Anna'));
    await user.clear(field);
    await user.type(field, 'Anna Reyes');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(mocks.updateProfile).toHaveBeenLastCalledWith('tok', { senderName: 'Anna Reyes' });
    expect(await screen.findByText('Your name is saved.')).toBeInTheDocument();
  });

  it('goes back to the sign-in screen only after an explicit sign out', async () => {
    useClerk({ userId: 'u1' });
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Your account' }));
    await user.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(await screen.findByRole('button', { name: 'Sign in with the test provider' })).toBeInTheDocument();
    expect(window.localStorage.getItem('gg.signedIn.v1')).toBeNull();
  });

  it('keeps the person where they are, with a note, when the session ends elsewhere', async () => {
    const clerk = useClerk({ userId: 'u1' });
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Your account' }));
    await screen.findByRole('heading', { level: 1, name: 'Your account' });
    act(() => clerk.endElsewhere());
    expect(await screen.findByText(ENDED)).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Your account' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Your account' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('button', { name: 'Sign in with the test provider' })).toBeInTheDocument();
    // Clerk said signed out while online: the marker goes.
    expect(window.localStorage.getItem('gg.signedIn.v1')).toBeNull();
  });

  it('ignores a slow "no name" answer for the first account after a second one signs in', async () => {
    // Account A's name check (the second profile request) answers "no name" only when released.
    const waiting: Array<() => void> = [];
    let asked = 0;
    mocks.getProfile.mockImplementation(async () => {
      asked += 1;
      if (asked !== 2) {
        return { ok: true, profile: PROFILE };
      }
      await new Promise<void>((resolve) => waiting.push(resolve));
      return { ok: false, reason: 'no_profile' };
    });
    const clerk = useClerk();
    const user = userEvent.setup();
    render(<App />);
    await signInFromScreen(user);
    await screen.findByRole('heading', { name: HOME });
    await user.click(await screen.findByRole('button', { name: 'Your account' }));
    await user.click(screen.getByRole('button', { name: 'Sign out' }));
    await screen.findByRole('button', { name: 'Sign in with the test provider' });
    act(() => clerk.signIn('u2'));
    await screen.findByRole('button', { name: 'Your account' });
    await act(async () => {
      waiting.forEach((release) => release());
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(screen.queryByRole('heading', { name: 'What should we call you?' })).not.toBeInTheDocument();
  });

  it('does not offer "Your account" under the path', async () => {
    window.localStorage.setItem(
      'gg.sessions.v1',
      JSON.stringify([{ ...LOCAL_SESSION, draft: null, obituaryUrl: '', drafts: {}, draftsUpdatedAt: {} }]),
    );
    useClerk({ userId: 'u1' });
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Margaret Hayes' }));
    await screen.findByRole('heading', { name: 'One thing at a time.' });
    expect(screen.queryByRole('button', { name: 'Your account' })).not.toBeInTheDocument();
  });

  it('shows a calm loading status only after a pause', async () => {
    vi.useFakeTimers();
    mocks.loadClerk.mockReturnValue(new Promise(() => undefined));
    render(<App />);
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });
    expect(screen.getByRole('status')).toHaveTextContent('Loading…');
  });
});

describe('Clerk cannot be reached (C5)', () => {
  beforeEach(() => {
    mocks.authEnabled = true;
    mocks.loadClerk.mockResolvedValue({ available: false });
  });

  it('shows a calm message, not a crash, with no signed-in marker', async () => {
    render(<App />);
    expect(await screen.findByRole('heading', { name: "Accounts aren't available right now" })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sign in with the test provider' })).not.toBeInTheDocument();
  });

  it('focuses the heading so the message is announced', async () => {
    render(<App />);
    const heading = await screen.findByRole('heading', { name: "Accounts aren't available right now" });
    // The focus runs in an effect after the heading is in the DOM, so wait for it.
    await waitFor(() => expect(document.activeElement).toBe(heading));
  });

  it('opens the local work with a calm note and no account actions when the signed-in marker exists', async () => {
    window.localStorage.setItem('gg.signedIn.v1', 'u1');
    window.localStorage.setItem('gg.sessions.v1', JSON.stringify([LOCAL_SESSION]));
    render(<App />);

    expect(await screen.findByText(NOT_REACHABLE)).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: HOME })).toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Margaret Hayes' }));
    await user.click(await screen.findByRole('button', { name: 'Continue' })); // "Started" on the path
    expect(await screen.findByLabelText(/Anything you'd like to add/)).toHaveValue('note kept on this device');
    expect(screen.queryByRole('button', { name: 'Your account' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sign out' })).not.toBeInTheDocument();
    expect(window.localStorage.getItem('gg.signedIn.v1')).toBe('u1');
    expect(window.localStorage.getItem('gg.sessions.v1')).not.toBeNull();
  });

  it('lands on Home, not a new person, when nobody is named yet', async () => {
    window.localStorage.setItem('gg.signedIn.v1', 'u1');
    render(<App />);
    expect(await screen.findByRole('heading', { name: HOME })).toBeInTheDocument();
    expect(screen.getByText('No one here yet.')).toBeInTheDocument();
    await act(async () => {});
    expect(JSON.parse(window.localStorage.getItem('gg.sessions.v1') ?? '[]')).toEqual([]);
  });

  it('retries the load from the unavailable state', async () => {
    const clerk = fakeClerk();
    mocks.loadClerk.mockResolvedValueOnce({ available: false });
    mocks.loadClerk.mockResolvedValue(clerk.load);
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('button', { name: 'Sign in with the test provider' })).toBeInTheDocument();
    expect(mocks.loadClerk).toHaveBeenCalledTimes(2);
  });
});
