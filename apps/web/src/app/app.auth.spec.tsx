/**
 * The account flow on the real App with a stub auth client (no network, no supabase-js).
 * The feature flag and the client loader are mocked so each test picks its own setup.
 */
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AuthClient } from '@griever/api-client/auth';
import type { AuthClientResult } from '../lib/authClient';

const mocks = vi.hoisted(() => ({
  authEnabled: false,
  load: vi.fn<() => Promise<AuthClientResult>>(),
  realClearError: null as null | (() => void),
  clearError: vi.fn(() => mocks.realClearError?.()),
}));

// Wraps the real hook only to see when the app asks it to clear its error.
vi.mock('@griever/hooks', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@griever/hooks')>();
  return {
    ...actual,
    useSupabaseIdentity: (options: Parameters<typeof actual.useSupabaseIdentity>[0]) => {
      const result = actual.useSupabaseIdentity(options);
      mocks.realClearError = result.clearError;
      return { ...result, clearError: mocks.clearError };
    },
  };
});

vi.mock('../lib/features', () => ({
  get AUTH_ENABLED() {
    return mocks.authEnabled;
  },
  OBITUARY_DRAFTING_ENABLED: false,
}));
vi.mock('../lib/authClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/authClient')>();
  return { ...actual, loadAuthClient: mocks.load };
});

import { App } from './app';

const PROFILE = {
  id: 'u1',
  senderName: 'Anna',
  contactSource: null,
  createdAt: '2026-10-11T00:00:00.000Z',
  updatedAt: '2026-10-11T00:00:00.000Z',
};

function stubClient(overrides: Partial<AuthClient> = {}): AuthClient {
  let signedIn = false;
  return {
    signUp: vi.fn(async () => {
      signedIn = true;
      return { ok: true as const, userId: 'u1' };
    }),
    signIn: vi.fn(async () => {
      signedIn = true;
      return { ok: true as const, userId: 'u1' };
    }),
    signOut: vi.fn(async () => {
      signedIn = false;
      return { ok: true as const, serverRevoked: true };
    }),
    getSession: vi.fn(async () =>
      signedIn
        ? { status: 'signed_in' as const, session: { userId: 'u1', email: 'a@b.co', accessToken: 't' } }
        : { status: 'signed_out' as const },
    ),
    refreshSession: vi.fn(async () => ({ status: 'signed_out' as const })),
    getProfile: vi.fn(async () => ({ ok: false as const, reason: 'no_profile' as const })),
    updateProfile: vi.fn(async (update: { senderName?: string }) => ({
      ok: true as const,
      profile: { ...PROFILE, senderName: update.senderName ?? null },
    })),
    ...overrides,
  } as AuthClient;
}

function useClient(client: AuthClient) {
  mocks.load.mockResolvedValue({ available: true, client });
}

async function fillSignUp(user: ReturnType<typeof userEvent.setup>) {
  await user.type(await screen.findByLabelText('Your name'), 'Anna');
  await user.type(screen.getByLabelText('Email'), 'anna@example.com');
  await user.type(screen.getByLabelText('Password'), 'a-long-password');
}

// From the screen right after signing in or up to the signed-out sign-up screen, via a saved
// session (the only way to reach "Your account").
async function nameSomeoneAndSignOut(user: ReturnType<typeof userEvent.setup>) {
  await user.type(await screen.findByLabelText('Their name'), 'Margaret Hayes');
  await user.click(screen.getByRole('button', { name: 'Continue' }));
  await user.click(await screen.findByRole('button', { name: 'Your account' }));
  await user.click(screen.getByRole('button', { name: 'Sign out' }));
}

async function signInAgainAs(user: ReturnType<typeof userEvent.setup>, email: string) {
  await user.click(await screen.findByRole('button', { name: 'I already have an account' }));
  await user.type(screen.getByLabelText('Email'), email);
  await user.type(screen.getByLabelText('Password'), 'a-long-password');
  await user.click(screen.getByRole('button', { name: 'Sign in' }));
  await screen.findByRole('button', { name: 'Your account' });
}

beforeEach(() => {
  mocks.authEnabled = false;
  mocks.load.mockReset();
  mocks.clearError.mockClear();
  window.localStorage.clear();
});

describe('flag off', () => {
  it('shows the contacts screen and never loads the auth client', async () => {
    render(<App />);
    expect(screen.getByRole('heading', { level: 1, name: 'Who should we be able to reach?' })).toBeInTheDocument();
    await Promise.resolve();
    expect(mocks.load).not.toHaveBeenCalled();
    expect(screen.queryByLabelText('Password')).not.toBeInTheDocument();
  });
});

describe('flag on', () => {
  beforeEach(() => {
    mocks.authEnabled = true;
  });

  it('shows a calm message, not a crash, when the client cannot be made', async () => {
    mocks.load.mockResolvedValue({ available: false });
    render(<App />);
    expect(await screen.findByRole('heading', { name: "Accounts aren't available right now" })).toBeInTheDocument();
    expect(screen.queryByLabelText('Password')).not.toBeInTheDocument();
  });

  describe('accounts unavailable with a session stored on this device', () => {
    const SESSION = JSON.stringify({ access_token: 'a', refresh_token: 'r', user: { id: 'u1' } });
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
        place: null,
        includeFlowers: false,
        floristId: null,
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

    it('opens the local work with a calm note and no account actions', async () => {
      window.localStorage.setItem('sb-abcdef-auth-token', SESSION);
      window.localStorage.setItem('gg.sessions.v1', JSON.stringify([LOCAL_SESSION]));
      mocks.load.mockResolvedValue({ available: false });
      render(<App />);

      expect(await screen.findByText("Your account can't be reached right now. Your work on this device is here.")).toBeInTheDocument();
      expect(await screen.findByLabelText(/Anything you'd like to add/)).toHaveValue('note kept on this device');
      expect(screen.queryByRole('button', { name: 'Your account' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Sign out' })).not.toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: "Accounts aren't available right now" })).not.toBeInTheDocument();
      expect(screen.queryByLabelText('Password')).not.toBeInTheDocument();
      expect(window.localStorage.getItem('sb-abcdef-auth-token')).toBe(SESSION);
      expect(window.localStorage.getItem('gg.sessions.v1')).not.toBeNull();
    });

    it('opens the path landing, without "Your account", when no message is half-written', async () => {
      window.localStorage.setItem('sb-abcdef-auth-token', SESSION);
      window.localStorage.setItem('gg.sessions.v1', JSON.stringify([{ ...LOCAL_SESSION, draft: null }]));
      mocks.load.mockResolvedValue({ available: false });
      render(<App />);

      expect(await screen.findByRole('heading', { name: 'One thing at a time.' })).toBeInTheDocument();
      expect(screen.getByText("Your account can't be reached right now. Your work on this device is here.")).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Your account' })).not.toBeInTheDocument();
    });

    it('ignores a stored value that is not a session', async () => {
      window.localStorage.setItem('sb-abcdef-auth-token', 'not json');
      mocks.load.mockResolvedValue({ available: false });
      render(<App />);
      expect(await screen.findByRole('heading', { name: "Accounts aren't available right now" })).toBeInTheDocument();
    });
  });

  it('creates the account, saves the name, and moves on to adding contacts', async () => {
    const client = stubClient();
    useClient(client);
    const user = userEvent.setup();
    render(<App />);
    await fillSignUp(user);
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    expect(client.signUp).toHaveBeenCalledWith('anna@example.com', 'a-long-password');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Who should we be able to reach?' }),
    ).toBeInTheDocument();
    await waitFor(() => expect(client.updateProfile).toHaveBeenCalledWith({ senderName: 'Anna' }));
  });

  it('says so when the email already has an account, and keeps what was typed', async () => {
    useClient(stubClient({ signUp: vi.fn(async () => ({ ok: false as const, reason: 'email_taken' as const })) }));
    const user = userEvent.setup();
    render(<App />);
    await fillSignUp(user);
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    expect(await screen.findByText('This email already has an account. Sign in instead.')).toBeInTheDocument();
    expect(screen.getByLabelText('Your name')).toHaveValue('Anna');
    expect(screen.getByLabelText('Email')).toHaveValue('anna@example.com');
    expect(screen.getByLabelText('Password')).toHaveValue('a-long-password');
    expect(screen.getByRole('button', { name: 'Create account' })).toBeEnabled();
  });

  it('keeps what was typed when offline', async () => {
    useClient(stubClient({ signUp: vi.fn(async () => ({ ok: false as const, reason: 'offline' as const })) }));
    const user = userEvent.setup();
    render(<App />);
    await fillSignUp(user);
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    expect(
      await screen.findByText("You need a connection to do this. Nothing you've typed is lost."),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Your name')).toHaveValue('Anna');
    expect(screen.getByLabelText('Email')).toHaveValue('anna@example.com');
    expect(screen.getByLabelText('Password')).toHaveValue('a-long-password');
  });

  it('signs in and lands on the existing path', async () => {
    const client = stubClient({
      getProfile: vi.fn(async () => ({ ok: true as const, profile: PROFILE })),
    });
    useClient(client);
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'I already have an account' }));
    await user.type(screen.getByLabelText('Email'), 'anna@example.com');
    await user.type(screen.getByLabelText('Password'), 'a-long-password');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(client.signIn).toHaveBeenCalledWith('anna@example.com', 'a-long-password');
    expect(await screen.findByRole('heading', { name: 'Who are we writing about?' })).toBeInTheDocument();
    expect(client.updateProfile).not.toHaveBeenCalled();
  });

  it('keeps what was typed when the sign-in does not match', async () => {
    useClient(stubClient({ signIn: vi.fn(async () => ({ ok: false as const, reason: 'invalid_credentials' as const })) }));
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'I already have an account' }));
    await user.type(screen.getByLabelText('Email'), 'anna@example.com');
    await user.type(screen.getByLabelText('Password'), 'wrong');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByText("That email and password don't match. Please try again.")).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toHaveValue('anna@example.com');
    expect(screen.getByLabelText('Password')).toHaveValue('wrong');
  });

  it('edits the name on the profile screen', async () => {
    const client = stubClient();
    useClient(client);
    const user = userEvent.setup();
    render(<App />);
    await fillSignUp(user);
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    await screen.findByRole('heading', { level: 1, name: 'Who should we be able to reach?' });
    await user.type(screen.getByLabelText('Name'), 'Aunt Carol');
    await user.type(screen.getByLabelText('Mobile number'), '6175550148');
    await user.click(screen.getByRole('button', { name: 'Add and start another' }));
    await user.click(await screen.findByRole('button', { name: 'Done for now' }));
    await user.click(screen.getByRole('button', { name: 'Save and continue' }));
    await user.type(await screen.findByLabelText('Their name'), 'Margaret Hayes');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.click(await screen.findByRole('button', { name: 'Your account' }));

    const field = await screen.findByLabelText('Your name');
    await waitFor(() => expect(field).toHaveValue('Anna'));
    await user.clear(field);
    await user.type(field, 'Anna Reyes');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(client.updateProfile).toHaveBeenLastCalledWith({ senderName: 'Anna Reyes' });
    expect(await screen.findByText('Your name is saved.')).toBeInTheDocument();
  });
  it('goes back to sign-up only after an explicit sign out', async () => {
    useClient(stubClient());
    const user = userEvent.setup();
    render(<App />);
    await fillSignUp(user);
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    await screen.findByRole('heading', { level: 1, name: 'Who should we be able to reach?' });
    await user.click(screen.getByRole('button', { name: 'Back' }));
    await user.type(await screen.findByLabelText('Their name'), 'Margaret Hayes');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.click(await screen.findByRole('button', { name: 'Your account' }));
    await user.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(await screen.findByRole('button', { name: 'Create account' })).toBeInTheDocument();
  });

  it('keeps the person where they are, with a note, when the session ends elsewhere', async () => {
    const client = stubClient({
      updateProfile: vi.fn(async () => ({ ok: false as const, reason: 'signed_out' as const })),
    });
    useClient(client);
    const user = userEvent.setup();
    render(<App />);
    await fillSignUp(user);
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    await screen.findByRole('heading', { level: 1, name: 'Who should we be able to reach?' });
    // The background name save above already hit the ended session; the person is still here.
    expect(
      await screen.findByText("You've been signed out. Your work on this device is safe. Sign in again when you're ready."),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Who should we be able to reach?' })).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
  });

  it('does not reuse the sign-up name after email confirmation, and asks for a name', async () => {
    const client = stubClient({
      signUp: vi.fn(async () => ({ ok: true as const, userId: 'u1' })),
    });
    useClient(client);
    const user = userEvent.setup();
    render(<App />);
    await fillSignUp(user);
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    expect(
      await screen.findByText('Please check your email to finish setting up your account, then come back here and sign in.'),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'I already have an account' }));
    await user.type(screen.getByLabelText('Email'), 'anna@example.com');
    await user.type(screen.getByLabelText('Password'), 'a-long-password');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('heading', { name: 'What should we call you?' })).toBeInTheDocument();
    expect(client.updateProfile).not.toHaveBeenCalled();
  });

  it('asks for a name when the background save after sign-up fails', async () => {
    const client = stubClient({
      updateProfile: vi.fn(async () => ({ ok: false as const, reason: 'offline' as const })),
    });
    useClient(client);
    const user = userEvent.setup();
    render(<App />);
    await fillSignUp(user);
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByRole('heading', { name: 'What should we call you?' })).toBeInTheDocument();
  });

  it('returns to adding contacts after the name prompt, so onboarding is not skipped', async () => {
    const updateProfile = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, reason: 'offline' })
      .mockImplementation(async (update: { senderName?: string }) => ({
        ok: true,
        profile: { ...PROFILE, senderName: update.senderName ?? null },
      }));
    useClient(stubClient({ updateProfile }));
    const user = userEvent.setup();
    render(<App />);
    await fillSignUp(user);
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    await screen.findByRole('heading', { name: 'What should we call you?' });
    await user.type(screen.getByLabelText('Your name'), 'Anna');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Who should we be able to reach?' }),
    ).toBeInTheDocument();
  });

  it('drops the name prompt when the save failed because the session ended', async () => {
    const client = stubClient({
      updateProfile: vi.fn(async () => ({ ok: false as const, reason: 'signed_out' as const })),
      // Never answers, so only dropping the old request can keep the prompt away.
      getProfile: vi.fn(() => new Promise<never>(() => undefined)),
    });
    useClient(client);
    const user = userEvent.setup();
    render(<App />);
    await fillSignUp(user);
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    await user.click(await screen.findByRole('button', { name: 'Sign in' }));

    await user.type(screen.getByLabelText('Email'), 'other@example.com');
    await user.type(screen.getByLabelText('Password'), 'a-long-password');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('heading', { name: 'Who are we writing about?' })).toBeInTheDocument();
    await waitFor(() => expect(client.getProfile).toHaveBeenCalled());
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(screen.queryByRole('heading', { name: 'What should we call you?' })).not.toBeInTheDocument();
  });

  it('signs in without waiting on the name check', async () => {
    const client = stubClient({ getProfile: vi.fn(() => new Promise<never>(() => undefined)) });
    useClient(client);
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'I already have an account' }));
    await user.type(screen.getByLabelText('Email'), 'anna@example.com');
    await user.type(screen.getByLabelText('Password'), 'a-long-password');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('heading', { name: 'Who are we writing about?' })).toBeInTheDocument();
  });

  it('ignores a slow "no name" answer for the first account after a second one signs in', async () => {
    // Account A's name check (the second profile request after signing in; the hook makes the
    // first) answers "no name" only when released. B's answers straight away.
    const waiting: Array<() => void> = [];
    let account = '';
    let askedForA = 0;
    const getProfile = vi.fn(async () => {
      if (account !== 'a@example.com') return { ok: true as const, profile: PROFILE };
      askedForA += 1;
      if (askedForA > 1) await new Promise<void>((resolve) => waiting.push(resolve));
      return { ok: false as const, reason: 'no_profile' as const };
    });
    const base = stubClient();
    const signIn = vi.fn(async (email: string) => {
      account = email;
      return base.signIn(email, 'a-long-password');
    });
    useClient({ ...base, getProfile, signIn } as AuthClient);
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole('button', { name: 'I already have an account' }));
    await user.type(screen.getByLabelText('Email'), 'a@example.com');
    await user.type(screen.getByLabelText('Password'), 'a-long-password');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    await nameSomeoneAndSignOut(user);
    await signInAgainAs(user, 'b@example.com');
    await waitFor(() => expect(waiting.length).toBeGreaterThan(0));

    await act(async () => {
      waiting.forEach((release) => release());
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(screen.queryByRole('heading', { name: 'What should we call you?' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Your account' })).toBeInTheDocument();
  });

  it('ignores a failed name save from a sign-up when another account has signed in since', async () => {
    let failSave: (value: { ok: false; reason: 'offline' }) => void = () => undefined;
    const updateProfile = vi.fn(
      () => new Promise<{ ok: false; reason: 'offline' }>((resolve) => (failSave = resolve)),
    );
    useClient(stubClient({ updateProfile, getProfile: vi.fn(async () => ({ ok: true as const, profile: PROFILE })) }));
    const user = userEvent.setup();
    render(<App />);
    await fillSignUp(user);
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    await screen.findByRole('heading', { level: 1, name: 'Who should we be able to reach?' });
    await waitFor(() => expect(updateProfile).toHaveBeenCalled());

    await user.click(screen.getByRole('button', { name: 'Back' }));
    await nameSomeoneAndSignOut(user);
    await signInAgainAs(user, 'b@example.com');

    await act(async () => {
      failSave({ ok: false, reason: 'offline' });
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(screen.queryByRole('heading', { name: 'What should we call you?' })).not.toBeInTheDocument();
  });

  it('goes straight to the path from adding contacts, without showing sign-up again', async () => {
    useClient(stubClient());
    const user = userEvent.setup();
    render(<App />);
    await fillSignUp(user);
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    await screen.findByRole('heading', { level: 1, name: 'Who should we be able to reach?' });

    let signUpShown = false;
    const watcher = new MutationObserver(() => {
      if (screen.queryByRole('button', { name: 'Create account' })) signUpShown = true;
    });
    watcher.observe(document.body, { childList: true, subtree: true });
    await user.click(screen.getByRole('button', { name: 'Back' }));
    await screen.findByRole('heading', { name: 'Who are we writing about?' });
    watcher.disconnect();
    expect(signUpShown).toBe(false);
  });

  it('clears the hook error when Profile opens', async () => {
    useClient(stubClient());
    const user = userEvent.setup();
    render(<App />);
    await fillSignUp(user);
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    await screen.findByRole('heading', { level: 1, name: 'Who should we be able to reach?' });
    await user.click(screen.getByRole('button', { name: 'Back' }));
    await user.type(await screen.findByLabelText('Their name'), 'Margaret Hayes');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    const open = await screen.findByRole('button', { name: 'Your account' });
    mocks.clearError.mockClear();
    await user.click(open);
    expect(mocks.clearError).toHaveBeenCalled();
  });

  it('hides "Your account" while the signed-out note is showing', async () => {
    useClient(stubClient({ updateProfile: vi.fn(async () => ({ ok: false as const, reason: 'signed_out' as const })) }));
    const user = userEvent.setup();
    render(<App />);
    await fillSignUp(user);
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    const note = await screen.findByText(/You've been signed out/);
    expect(note.closest('[aria-live="polite"]')).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'Your account' })).not.toBeInTheDocument();
  });

  it('reaches the app offline with a stored session (C5)', async () => {
    useClient(stubClient({ getSession: vi.fn(async () => ({ status: 'offline' as const })) }));
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Who are we writing about?' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Password')).not.toBeInTheDocument();
  });

  it('retries the load from the unavailable state', async () => {
    const client = stubClient();
    mocks.load.mockResolvedValueOnce({ available: false });
    mocks.load.mockResolvedValue({ available: true, client });
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Try again' }));
    expect(await screen.findByLabelText('Password')).toBeInTheDocument();
    expect(mocks.load).toHaveBeenCalledTimes(2);
  });

  it('shows a calm loading status only after a pause', async () => {
    vi.useFakeTimers();
    try {
      mocks.load.mockReturnValue(new Promise(() => undefined));
      render(<App />);
      expect(screen.getByRole('status')).toBeEmptyDOMElement();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(600);
      });
      expect(screen.getByRole('status')).toHaveTextContent('Loading…');
    } finally {
      vi.useRealTimers();
    }
  });
});
