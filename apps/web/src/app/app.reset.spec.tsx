/**
 * Forgotten-password flow on the real App with a stub auth client (no network, no supabase-js).
 */
import { StrictMode } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AuthClient } from '@griever/api-client/auth';
import type { AuthClientResult } from '../lib/authClient';

const mocks = vi.hoisted(() => ({
  load: vi.fn<() => Promise<AuthClientResult>>(),
}));

vi.mock('../lib/features', () => ({
  AUTH_ENABLED: true,
  OBITUARY_DRAFTING_ENABLED: false,
}));
vi.mock('../lib/authClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/authClient')>();
  return { ...actual, loadAuthClient: mocks.load };
});

import { App } from './app';
import { maskEmail } from '../lib/recoveryLink';

function stubClient(overrides: Partial<AuthClient> = {}): AuthClient {
  let signedIn = false;
  return {
    signUp: vi.fn(async () => ({ ok: true as const, userId: 'u1' })),
    signIn: vi.fn(async () => ({ ok: true as const, userId: 'u1' })),
    signOut: vi.fn(async () => ({ ok: true as const, serverRevoked: true })),
    getSession: vi.fn(async () =>
      signedIn
        ? { status: 'signed_in' as const, session: { userId: 'u1', email: 'a@b.co', accessToken: 't' } }
        : { status: 'signed_out' as const },
    ),
    refreshSession: vi.fn(async () => ({ status: 'signed_out' as const })),
    startAutoRefresh: vi.fn(async () => undefined),
    stopAutoRefresh: vi.fn(async () => undefined),
    getProfile: vi.fn(async () => ({ ok: false as const, reason: 'no_profile' as const })),
    updateProfile: vi.fn(),
    requestPasswordReset: vi.fn(async () => ({ ok: true as const })),
    consumeRecoveryFromUrl: vi.fn(async () => ({ ok: true as const, email: 'anna@example.com' })),
    completePasswordReset: vi.fn(async () => {
      signedIn = true;
      return { ok: true as const };
    }),
    ...overrides,
  } as AuthClient;
}

beforeEach(() => {
  mocks.load.mockReset();
  window.localStorage.clear();
  window.history.replaceState(null, '', '/');
});

describe('asking for a reset link', () => {
  it('goes from sign-in to the reset screen and shows the calm status without saying whether the email exists', async () => {
    const client = stubClient();
    mocks.load.mockResolvedValue({ available: true, client });
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole('button', { name: 'I already have an account' }));
    await user.click(screen.getByRole('button', { name: 'Forgot your password?' }));
    expect(screen.getByRole('heading', { name: 'Reset your password' })).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toHaveAttribute('autocomplete', 'email');

    await user.type(screen.getByLabelText('Email'), ' anna@example.com ');
    await user.click(screen.getByRole('button', { name: 'Send me a link' }));

    const status = await screen.findByText(
      "If that email has an account, we've sent a link to reset your password. It may take a few minutes.",
    );
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(status).toHaveAttribute('role', 'status');
    expect(client.requestPasswordReset).toHaveBeenCalledWith('anna@example.com', window.location.origin);
    expect(document.body.textContent).not.toContain('!');
  });

  it('shows calm copy when the request fails and keeps the email', async () => {
    const client = stubClient({ requestPasswordReset: vi.fn(async () => ({ ok: false as const, reason: 'offline' as const })) });
    mocks.load.mockResolvedValue({ available: true, client });
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'I already have an account' }));
    await user.click(screen.getByRole('button', { name: 'Forgot your password?' }));
    await user.type(screen.getByLabelText('Email'), 'anna@example.com');
    await user.click(screen.getByRole('button', { name: 'Send me a link' }));

    expect(await screen.findByText(/You need a connection/)).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toHaveValue('anna@example.com');
  });
});

describe('opening a recovery link', () => {
  const RECOVERY = '/?reset=1#access_token=at&refresh_token=rt&type=recovery';

  it('shows the new-password screen, cleans the URL, then signs in on success', async () => {
    window.history.replaceState(null, '', RECOVERY);
    const client = stubClient();
    mocks.load.mockResolvedValue({ available: true, client });
    const user = userEvent.setup();
    render(<App />);

    expect(await screen.findByRole('heading', { name: 'Choose a new password' })).toBeInTheDocument();
    const field = await screen.findByLabelText('New password');
    expect(field).toHaveAttribute('autocomplete', 'new-password');
    expect(field).toHaveAttribute('minlength', '8');
    expect(screen.getByText('Use at least 8 characters.')).toBeInTheDocument();

    expect(client.consumeRecoveryFromUrl).toHaveBeenCalledTimes(1);
    expect(client.consumeRecoveryFromUrl).toHaveBeenCalledWith(expect.stringContaining('access_token=at'));
    expect(window.location.hash).toBe('');
    expect(window.location.search).toBe('');
    // Whose password this is, masked, from the link itself.
    expect(screen.getByText(/For a•••@example\.com\./)).toBeInTheDocument();

    await user.type(field, 'a-new-long-password');
    await user.click(screen.getByRole('button', { name: 'Save new password' }));

    expect(await screen.findByText("Your password is changed. You're signed in.")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue' })).toHaveFocus();
    expect(client.completePasswordReset).toHaveBeenCalledWith('a-new-long-password');

    await user.click(screen.getByRole('button', { name: 'Continue' }));
    // Signed in, then the same next step as a normal sign-in to an account with no name yet.
    expect(await screen.findByRole('heading', { name: 'What should we call you?' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Create account' })).not.toBeInTheDocument();
  });

  it('says the link has expired and offers a new one', async () => {
    window.history.replaceState(null, '', '/?reset=1#error=access_denied&error_code=otp_expired');
    const client = stubClient({
      consumeRecoveryFromUrl: vi.fn(async () => ({ ok: false as const, reason: 'expired_link' as const })),
    });
    mocks.load.mockResolvedValue({ available: true, client });
    const user = userEvent.setup();
    render(<App />);

    expect(await screen.findByText('That link has expired. You can ask for a new one.')).toBeInTheDocument();
    expect(screen.queryByLabelText('New password')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Send me a new link' }));
    expect(screen.getByRole('heading', { name: 'Reset your password' })).toBeInTheDocument();
  });

  it('keeps the screen and shows the weak-password copy', async () => {
    window.history.replaceState(null, '', RECOVERY);
    const client = stubClient({
      completePasswordReset: vi.fn(async () => ({ ok: false as const, reason: 'weak_password' as const })),
    });
    mocks.load.mockResolvedValue({ available: true, client });
    const user = userEvent.setup();
    render(<App />);
    await user.type(await screen.findByLabelText('New password'), 'password1');
    await user.click(screen.getByRole('button', { name: 'Save new password' }));

    expect(await screen.findByText('Please choose a stronger password.')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText('New password')).toHaveValue('password1'));
  });

  it('shows expired copy when the session lapsed before the password was saved', async () => {
    window.history.replaceState(null, '', RECOVERY);
    const client = stubClient({
      completePasswordReset: vi.fn(async () => ({ ok: false as const, reason: 'expired_link' as const })),
    });
    mocks.load.mockResolvedValue({ available: true, client });
    const user = userEvent.setup();
    render(<App />);
    await user.type(await screen.findByLabelText('New password'), 'a-new-long-password');
    await user.click(screen.getByRole('button', { name: 'Save new password' }));

    expect(await screen.findByText('That link has expired. You can ask for a new one.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send me a new link' })).toBeInTheDocument();
  });

  it('has already cleaned the address bar when the link is read', async () => {
    window.history.replaceState(null, '', RECOVERY);
    let hashAtCall: string | null = null;
    let hrefArg = '';
    const client = stubClient({
      consumeRecoveryFromUrl: vi.fn(async (url: string) => {
        hashAtCall = window.location.hash;
        hrefArg = url;
        return { ok: true as const, email: null };
      }),
    });
    mocks.load.mockResolvedValue({ available: true, client });
    render(<App />);
    await screen.findByLabelText('New password');
    expect(hashAtCall).toBe('');
    expect(hrefArg).toContain('access_token=at');
  });

  it('clears the token even when accounts cannot be loaded', async () => {
    window.history.replaceState(null, '', RECOVERY);
    mocks.load.mockResolvedValue({ available: false });
    render(<App />);
    await screen.findByRole('heading', { name: "Accounts aren't available right now" });
    expect(window.location.hash).toBe('');
  });

  it('reads the link once under StrictMode', async () => {
    window.history.replaceState(null, '', RECOVERY);
    const client = stubClient();
    mocks.load.mockResolvedValue({ available: true, client });
    render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
    await screen.findByLabelText('New password');
    expect(client.consumeRecoveryFromUrl).toHaveBeenCalledTimes(1);
  });

  it('announces that it is checking, with no Save button yet', async () => {
    window.history.replaceState(null, '', RECOVERY);
    let release: (v: { ok: true; email: string | null }) => void = () => undefined;
    const client = stubClient({
      consumeRecoveryFromUrl: vi.fn(() => new Promise((resolve) => (release = resolve))) as AuthClient['consumeRecoveryFromUrl'],
    });
    mocks.load.mockResolvedValue({ available: true, client });
    render(<App />);
    const status = await screen.findByText('Checking your link…');
    expect(status).toHaveAttribute('role', 'status');
    expect(screen.queryByRole('button', { name: 'Save new password' })).not.toBeInTheDocument();
    release({ ok: true, email: null });
    expect(await screen.findByRole('button', { name: 'Save new password' })).toBeInTheDocument();
  });

  it('keeps one status region, moves focus to the heading, and offers Back to sign in when expired', async () => {
    window.history.replaceState(null, '', '/?reset=1#error=access_denied&error_code=otp_expired');
    const client = stubClient({
      consumeRecoveryFromUrl: vi.fn(async () => ({ ok: false as const, reason: 'expired_link' as const })),
    });
    mocks.load.mockResolvedValue({ available: true, client });
    const user = userEvent.setup();
    render(<App />);
    const status = await screen.findByText('That link has expired. You can ask for a new one.');
    expect(status).toHaveAttribute('role', 'status');
    expect(screen.getByRole('heading', { name: 'Choose a new password' })).toHaveFocus();
    await user.click(screen.getByRole('button', { name: 'Back to sign in' }));
    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
  });

  it('leaves another signed-in account alone', async () => {
    window.history.replaceState(null, '', RECOVERY);
    const client = stubClient({
      consumeRecoveryFromUrl: vi.fn(async () => ({ ok: false as const, reason: 'different_account' as const })),
    });
    mocks.load.mockResolvedValue({ available: true, client });
    render(<App />);
    expect(await screen.findByText('This link is for a different account.')).toBeInTheDocument();
    expect(screen.queryByLabelText('New password')).not.toBeInTheDocument();
    expect(client.completePasswordReset).not.toHaveBeenCalled();
  });
});

describe('maskEmail', () => {
  it('keeps the first letter and the domain', () => {
    expect(maskEmail('anna@example.com')).toBe('a•••@example.com');
    expect(maskEmail('nonsense')).toBe('nonsense');
  });
});
