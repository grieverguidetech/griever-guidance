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

import { freshDraft } from '@griever/hooks';
import { App } from './app';

const PROFILE = {
  id: 'u1',
  senderName: 'Anna',
  contactSource: null,
  accountType: 'owner' as const,
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

const HOME = "The people you're writing about";

// From Home (where "Your account" sits) to the signed-out sign-up screen.
async function signOutFromHome(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: 'Your account' }));
  await user.click(screen.getByRole('button', { name: 'Sign out' }));
}

// Sign-up lands on Profile first; Continue goes on to Home (#114).
async function signUpToHome(user: ReturnType<typeof userEvent.setup>) {
  await fillSignUp(user);
  await user.click(screen.getByRole('button', { name: 'Create account' }));
  await screen.findByRole('heading', { level: 1, name: 'Your account' });
  await user.click(screen.getByRole('button', { name: 'Continue' }));
  await screen.findByRole('heading', { level: 1, name: HOME });
}

async function signIn(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: 'I already have an account' }));
  await user.type(screen.getByLabelText('Email'), 'anna@example.com');
  await user.type(screen.getByLabelText('Password'), 'a-long-password');
  await user.click(screen.getByRole('button', { name: 'Sign in' }));
}

async function signInAgainAs(user: ReturnType<typeof userEvent.setup>, email: string) {
  await user.click(await screen.findByRole('button', { name: 'I already have an account' }));
  await user.type(screen.getByLabelText('Email'), email);
  await user.type(screen.getByLabelText('Password'), 'a-long-password');
  await user.click(screen.getByRole('button', { name: 'Sign in' }));
  await screen.findByRole('button', { name: 'Your account' });
}

afterEach(() => {
  vi.useRealTimers();
});

beforeEach(() => {
  mocks.authEnabled = false;
  mocks.load.mockReset();
  mocks.clearError.mockClear();
  window.localStorage.clear();
});

describe('flag off', () => {
  it('shows Home and never loads the auth client', async () => {
    render(<App />);
    expect(screen.getByRole('heading', { level: 1, name: "The people you're writing about" })).toBeInTheDocument();
    await Promise.resolve();
    expect(mocks.load).not.toHaveBeenCalled();
    expect(screen.queryByLabelText('Password')).not.toBeInTheDocument();
  });
});

describe('flag on', () => {
  beforeEach(() => {
    mocks.authEnabled = true;
  });

  it('does not move focus when a signed-in person cold-loads straight past sign-up (#50)', async () => {
    useClient(
      stubClient({
        getSession: vi.fn(async () => ({
          status: 'signed_in' as const,
          session: { userId: 'u1', email: 'a@b.co', accessToken: 't' },
        })),
        getProfile: vi.fn(async () => ({ ok: true as const, profile: PROFILE })),
      }),
    );
    render(<App />);
    await screen.findByRole('button', { name: "What you'll need" });
    await act(async () => {});
    expect(screen.queryByLabelText('Password')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    expect(document.activeElement).toBe(document.body);
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
      expect(await screen.findByRole('heading', { name: HOME })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Your account' })).not.toBeInTheDocument();
      const user = userEvent.setup();
      await user.click(screen.getByRole('button', { name: 'Margaret Hayes' }));
      await user.click(await screen.findByRole('button', { name: 'Continue' })); // "Started" on the path
      expect(await screen.findByLabelText(/Anything you'd like to add/)).toHaveValue('note kept on this device');
      expect(screen.queryByRole('button', { name: 'Your account' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Sign out' })).not.toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: "Accounts aren't available right now" })).not.toBeInTheDocument();
      expect(screen.queryByLabelText('Password')).not.toBeInTheDocument();
      expect(window.localStorage.getItem('sb-abcdef-auth-token')).toBe(SESSION);
      expect(window.localStorage.getItem('gg.sessions.v1')).not.toBeNull();
    });

    it('lands on Home, then the path, without "Your account", when no message is half-written', async () => {
      window.localStorage.setItem('sb-abcdef-auth-token', SESSION);
      window.localStorage.setItem('gg.sessions.v1', JSON.stringify([{ ...LOCAL_SESSION, draft: null }]));
      mocks.load.mockResolvedValue({ available: false });
      render(<App />);

      await userEvent.setup().click(await screen.findByRole('button', { name: 'Margaret Hayes' }));
      expect(await screen.findByRole('heading', { name: 'One thing at a time.' })).toBeInTheDocument();
      expect(screen.getByText("Your account can't be reached right now. Your work on this device is here.")).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Your account' })).not.toBeInTheDocument();
    });

    it('lands on Home, not a new person or contacts, when nobody is named yet', async () => {
      window.localStorage.setItem('sb-abcdef-auth-token', SESSION);
      mocks.load.mockResolvedValue({ available: false });
      render(<App />);

      expect(await screen.findByRole('heading', { name: HOME })).toBeInTheDocument();
      expect(screen.getByText('No one here yet.')).toBeInTheDocument();
      expect(screen.queryByLabelText('Their name')).not.toBeInTheDocument();
      await act(async () => {});
      expect(JSON.parse(window.localStorage.getItem('gg.sessions.v1') ?? '[]')).toEqual([]);
    });

    it('ignores a stored value that is not a session', async () => {
      window.localStorage.setItem('sb-abcdef-auth-token', 'not json');
      mocks.load.mockResolvedValue({ available: false });
      render(<App />);
      expect(await screen.findByRole('heading', { name: "Accounts aren't available right now" })).toBeInTheDocument();
    });
  });

  it('creates the account, saves the name, shows Profile, and Continue goes to an empty Home', async () => {
    const client = stubClient();
    useClient(client);
    const user = userEvent.setup();
    render(<App />);
    await fillSignUp(user);
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    expect(client.signUp).toHaveBeenCalledWith('anna@example.com', 'a-long-password');
    expect(await screen.findByRole('heading', { level: 1, name: 'Your account' })).toBeInTheDocument();
    expect(screen.getByLabelText('Your name')).toHaveValue('Anna');
    await waitFor(() => expect(client.updateProfile).toHaveBeenCalledWith({ senderName: 'Anna' }));
    // No path from sign-up leads to adding contacts.
    expect(screen.queryByRole('heading', { name: 'Who should we be able to reach?' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByRole('heading', { level: 1, name: HOME })).toBeInTheDocument();
    expect(screen.getByText('No one here yet.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: "Start with someone I've lost" })).toBeInTheDocument();
  });

  it('never holds Continue back on a slow profile request (C5)', async () => {
    const client = stubClient({ updateProfile: vi.fn(() => new Promise<never>(() => undefined)) });
    useClient(client);
    const user = userEvent.setup();
    render(<App />);
    await fillSignUp(user);
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    await screen.findByRole('heading', { level: 1, name: 'Your account' });
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByRole('heading', { level: 1, name: HOME })).toBeInTheDocument();
  });

  it('after sign-up, Home leads to setup, then contacts, and Back from contacts returns to setup', async () => {
    useClient(stubClient());
    const user = userEvent.setup();
    render(<App />);
    await signUpToHome(user);
    await user.click(screen.getByRole('button', { name: "Start with someone I've lost" }));
    await user.type(await screen.findByLabelText('Their name'), 'Margaret Hayes');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await screen.findByRole('heading', { level: 1, name: 'Who should we be able to reach?' });
    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(await screen.findByLabelText('Their name')).toHaveValue('Margaret Hayes');
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

  it('signs in and lands on Home', async () => {
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
    expect(await screen.findByRole('heading', { name: HOME })).toBeInTheDocument();
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
    await signUpToHome(user);
    await user.click(await screen.findByRole('button', { name: 'Your account' }));

    const field = await screen.findByLabelText('Your name');
    await waitFor(() => expect(field).toHaveValue('Anna'));
    await user.clear(field);
    await user.type(field, 'Anna Reyes');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(client.updateProfile).toHaveBeenLastCalledWith({ senderName: 'Anna Reyes' });
    expect(await screen.findByText('Your name is saved.')).toBeInTheDocument();
  });
  it('opens the path after signing out and back in, with each half-written message kept and resumed in its own place', async () => {
    const draft = (templateCategory: 'announcement' | 'service', step: 'announce' | 'details', fields: Record<string, string>) =>
      freshDraft({ templateCategory, step, fields });
    window.localStorage.setItem(
      'gg.sessions.v1',
      JSON.stringify([
        {
          id: 's1',
          personName: 'Margaret Hayes',
          dateOfPassing: '',
          senderName: 'Anna',
          obituaryUrl: '',
          createdAt: '2026-10-10T00:00:00.000Z',
          lastOpenedAt: '2026-10-10T00:00:00.000Z',
          recipientsNotified: {},
          momentCompletedAt: {},
          remindersScheduled: [],
          serviceReady: true,
          drafts: {
            announcement: draft('announcement', 'announce', { personalNote: 'the announcement note' }),
            service: draft('service', 'details', { serviceLocation: 'St Mary Church' }),
          },
          draftsUpdatedAt: { announcement: '2026-10-10T00:00:00.000Z', service: '2026-10-01T00:00:00.000Z' },
        },
      ]),
    );
    useClient(
      stubClient({ getProfile: vi.fn(async () => ({ ok: true as const, profile: PROFILE })) }),
    );
    // Only Date is faked, so the order the drafts were touched in can be set: the announcement last.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-12T00:00:00Z'));
    const user = userEvent.setup();
    render(<App />);
    await signIn(user);
    await user.click(await screen.findByRole('button', { name: 'Margaret Hayes' })); // Home, then the path (#176)
    expect(await screen.findByRole('heading', { name: 'One thing at a time.' })).toBeInTheDocument();
    expect(screen.getAllByText(/Started/)).toHaveLength(2);
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByLabelText(/Anything you'd like to add/)).toHaveValue('the announcement note');

    await user.click(screen.getByRole('button', { name: 'Back' })); // the first form goes to the path
    vi.setSystemTime(new Date('2026-10-05T00:00:00Z'));
    await user.click(screen.getByRole('button', { name: /Share the service/ }));
    expect(await screen.findByLabelText(/^Location/)).toHaveValue('St Mary Church');
    await user.click(screen.getByRole('button', { name: 'Back' }));
    await user.click(screen.getByRole('button', { name: 'Back' })); // path to Home (#112)
    await user.click(await screen.findByRole('button', { name: 'Your account' }));
    await user.click(screen.getByRole('button', { name: 'Sign out' }));
    await signIn(user);
    await user.click(await screen.findByRole('button', { name: 'Margaret Hayes' }));

    // Both drafts are still there, and the announcement still resumes with its own words.
    expect(await screen.findByRole('heading', { name: 'One thing at a time.' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByLabelText(/Anything you'd like to add/)).toHaveValue('the announcement note');
  });

  it('goes back to sign-up only after an explicit sign out', async () => {
    useClient(stubClient());
    const user = userEvent.setup();
    render(<App />);
    await signUpToHome(user);
    await signOutFromHome(user);
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
    await screen.findByRole('heading', { level: 1, name: 'Your account' });
    // The background name save above already hit the ended session; the person is still here.
    expect(
      await screen.findByText("You've been signed out. Your work on this device is safe. Sign in again when you're ready."),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Your account' })).toBeInTheDocument();
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

  it('keeps a calm message on Profile when the background save after sign-up fails, and Continue still reaches Home', async () => {
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
    // One h1, and it does not change in place.
    expect(await screen.findByRole('heading', { level: 1, name: 'Your account' })).toBeInTheDocument();
    const note = await screen.findByText("We couldn't save your name. You can try again.");
    expect(note.closest('[aria-live="polite"]')).not.toBeNull();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Sign out' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();

    // Continue retries the save in the background and goes straight on.
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByRole('heading', { level: 1, name: HOME })).toBeInTheDocument();
    await waitFor(() => expect(updateProfile).toHaveBeenCalledTimes(2));
    expect(updateProfile).toHaveBeenLastCalledWith({ senderName: 'Anna' });
  });

  it('saves a name changed on the first Profile when Continue is pressed', async () => {
    const client = stubClient();
    useClient(client);
    const user = userEvent.setup();
    render(<App />);
    await fillSignUp(user);
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    await screen.findByRole('heading', { level: 1, name: 'Your account' });
    await waitFor(() => expect(client.updateProfile).toHaveBeenCalledWith({ senderName: 'Anna' }));
    await user.clear(screen.getByLabelText('Your name'));
    await user.type(screen.getByLabelText('Your name'), 'Anna Reyes');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await screen.findByRole('heading', { level: 1, name: HOME });
    await waitFor(() => expect(client.updateProfile).toHaveBeenLastCalledWith({ senderName: 'Anna Reyes' }));
  });

  it('Back on the first Profile goes to Home', async () => {
    useClient(stubClient());
    const user = userEvent.setup();
    render(<App />);
    await fillSignUp(user);
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    await screen.findByRole('heading', { level: 1, name: 'Your account' });
    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(await screen.findByRole('heading', { level: 1, name: HOME })).toBeInTheDocument();
  });

  it('a late failed save never pulls the person back from what they moved on to', async () => {
    let fail: (value: { ok: false; reason: 'offline' }) => void = () => undefined;
    const updateProfile = vi.fn(() => new Promise<{ ok: false; reason: 'offline' }>((resolve) => (fail = resolve)));
    useClient(stubClient({ updateProfile }));
    const user = userEvent.setup();
    render(<App />);
    await fillSignUp(user);
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    await screen.findByRole('heading', { level: 1, name: 'Your account' });
    await waitFor(() => expect(updateProfile).toHaveBeenCalled());
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.click(await screen.findByRole('button', { name: "Start with someone I've lost" }));
    expect(await screen.findByLabelText('Their name')).toBeInTheDocument();

    await act(async () => {
      fail({ ok: false, reason: 'offline' });
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(screen.getByLabelText('Their name')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'What should we call you?' })).not.toBeInTheDocument();
  });

  it('shows no first-time Continue on "Your account" after the session ended and the person signed in again', async () => {
    const client = stubClient({
      updateProfile: vi.fn(async () => ({ ok: false as const, reason: 'signed_out' as const })),
      getProfile: vi.fn(async () => ({ ok: true as const, profile: PROFILE })),
    });
    useClient(client);
    const user = userEvent.setup();
    render(<App />);
    await fillSignUp(user);
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    await user.click(await screen.findByRole('button', { name: 'Sign in' })); // the signed-out note
    await user.type(screen.getByLabelText('Email'), 'anna@example.com');
    await user.type(screen.getByLabelText('Password'), 'a-long-password');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    await user.click(await screen.findByRole('button', { name: 'Your account' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Your account' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Continue' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument();
  });

  it('does not offer "Your account" under the path', async () => {
    window.localStorage.setItem(
      'gg.sessions.v1',
      JSON.stringify([
        {
          id: 's1',
          personName: 'Margaret Hayes',
          dateOfPassing: '',
          senderName: 'Anna',
          obituaryUrl: '',
          createdAt: '2026-10-10T00:00:00.000Z',
          lastOpenedAt: '2026-10-10T00:00:00.000Z',
          recipientsNotified: {},
          momentCompletedAt: {},
          remindersScheduled: [],
          serviceReady: false,
          drafts: {},
          draftsUpdatedAt: {},
        },
      ]),
    );
    useClient(stubClient({ getProfile: vi.fn(async () => ({ ok: true as const, profile: PROFILE })) }));
    const user = userEvent.setup();
    render(<App />);
    await signIn(user);
    await user.click(await screen.findByRole('button', { name: 'Margaret Hayes' }));
    await screen.findByRole('heading', { name: 'One thing at a time.' });
    expect(screen.queryByRole('button', { name: 'Your account' })).not.toBeInTheDocument();
  });

  it('asks for a name at boot when the stored session belongs to an account without one', async () => {
    useClient(
      stubClient({
        getSession: vi.fn(async () => ({
          status: 'signed_in' as const,
          session: { userId: 'u1', email: 'a@b.co', accessToken: 't' },
        })),
      }),
    );
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'What should we call you?' })).toBeInTheDocument();
  });

  it('tidies an unnamed person left by the old flow', async () => {
    window.localStorage.setItem(
      'gg.sessions.v1',
      JSON.stringify([
        {
          id: 'orphan',
          personName: '',
          dateOfPassing: '',
          senderName: '',
          obituaryUrl: '',
          createdAt: '2026-10-10T00:00:00.000Z',
          lastOpenedAt: '2026-10-10T00:00:00.000Z',
          recipientsNotified: {},
          momentCompletedAt: {},
          remindersScheduled: [],
          serviceReady: false,
          drafts: {},
          draftsUpdatedAt: {},
        },
      ]),
    );
    useClient(stubClient());
    render(<App />);
    await waitFor(() => expect(JSON.parse(window.localStorage.getItem('gg.sessions.v1') ?? '[]')).toEqual([]));
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

    expect(await screen.findByRole('heading', { name: HOME })).toBeInTheDocument();
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
    expect(await screen.findByRole('heading', { name: HOME })).toBeInTheDocument();
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
    await screen.findByRole('heading', { name: HOME });
    await signOutFromHome(user);
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
    await screen.findByRole('heading', { level: 1, name: 'Your account' });
    await waitFor(() => expect(updateProfile).toHaveBeenCalled());

    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await signOutFromHome(user);
    await signInAgainAs(user, 'b@example.com');

    await act(async () => {
      failSave({ ok: false, reason: 'offline' });
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(screen.queryByRole('heading', { name: 'What should we call you?' })).not.toBeInTheDocument();
  });

  it('goes straight to Home from Profile, without showing sign-up again', async () => {
    useClient(stubClient());
    const user = userEvent.setup();
    render(<App />);
    await fillSignUp(user);
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    await screen.findByRole('heading', { level: 1, name: 'Your account' });

    let signUpShown = false;
    const watcher = new MutationObserver(() => {
      if (screen.queryByRole('button', { name: 'Create account' })) signUpShown = true;
    });
    watcher.observe(document.body, { childList: true, subtree: true });
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await screen.findByRole('heading', { name: HOME });
    watcher.disconnect();
    expect(signUpShown).toBe(false);
  });

  it('clears the hook error when Profile opens', async () => {
    useClient(stubClient());
    const user = userEvent.setup();
    render(<App />);
    await signUpToHome(user);
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
    // Offline, the profile request fails like the session check does; that never reads as "no name".
    useClient(
      stubClient({
        getSession: vi.fn(async () => ({ status: 'offline' as const })),
        getProfile: vi.fn(async () => ({ ok: false as const, reason: 'offline' as const })),
      }),
    );
    render(<App />);
    expect(await screen.findByRole('heading', { name: HOME })).toBeInTheDocument();
    expect(screen.getByText('No one here yet.')).toBeInTheDocument();
    expect(screen.queryByLabelText('Password')).not.toBeInTheDocument();
    // Nothing is created on the way in: only Home's button starts a person.
    expect(JSON.parse(window.localStorage.getItem('gg.sessions.v1') ?? '[]')).toEqual([]);
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
