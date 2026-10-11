import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { AuthClient, ProfileResult, SessionState, SignInResult, SignUpResult } from '@griever/api-client/auth';
import { AccountScreen } from './AccountScreen';
import { AccountProvider } from '../lib/AccountProvider';

const signedIn: SessionState = { status: 'signed_in', session: { userId: 'u1', email: 'a@b.co', accessToken: 't' } };
const noProfile: ProfileResult = { ok: false, reason: 'no_profile' };
const profileWith = (senderName: string): ProfileResult => ({
  ok: true,
  profile: { senderName, contactSource: null } as never,
});

function stubClient(overrides: Partial<Record<keyof AuthClient, unknown>> = {}) {
  const client = {
    signUp: jest.fn(async (): Promise<SignUpResult> => ({ ok: true, userId: 'u1' })),
    signIn: jest.fn(async (): Promise<SignInResult> => ({ ok: true, userId: 'u1' })),
    signOut: jest.fn(async () => ({ ok: true as const, serverRevoked: true })),
    getSession: jest.fn(async (): Promise<SessionState> => ({ status: 'signed_out' })),
    refreshSession: jest.fn(async (): Promise<SessionState> => ({ status: 'signed_out' })),
    getProfile: jest.fn(async (): Promise<ProfileResult> => noProfile),
    updateProfile: jest.fn(async (u: { senderName?: string | null }): Promise<ProfileResult> => profileWith(u.senderName ?? '')),
  };
  Object.assign(client, overrides);
  return client as unknown as AuthClient & typeof client;
}

function renderAccount(client: AuthClient | null) {
  return render(
    <AccountProvider client={client}>
      <AccountScreen onBack={() => undefined} />
    </AccountProvider>,
  );
}

const type = (label: string, text: string) => fireEvent.changeText(screen.getByLabelText(label), text);

describe('missing configuration', () => {
  it('shows the calm unavailable state', () => {
    renderAccount(null);
    expect(screen.getByText("Accounts aren't available right now.")).toBeTruthy();
  });
});

describe('sign in', () => {
  it('signs in and shows the profile', async () => {
    const client = stubClient();
    client.getSession.mockResolvedValueOnce({ status: 'signed_out' }).mockResolvedValue(signedIn);
    renderAccount(client);
    await screen.findByLabelText('Email');
    type('Email', ' a@b.co ');
    type('Password', 'secret-pass');
    fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));
    await screen.findByText('Your account');
    expect(client.signIn).toHaveBeenCalledWith('a@b.co', 'secret-pass');
  });

  it('keeps the typed fields and shows the hook copy on a wrong password', async () => {
    const client = stubClient({ signIn: jest.fn(async () => ({ ok: false, reason: 'invalid_credentials' })) });
    renderAccount(client);
    await screen.findByLabelText('Email');
    type('Email', 'a@b.co');
    type('Password', 'nope');
    fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));
    await screen.findByText("That email and password don't match. Please try again.");
    expect(screen.getByLabelText('Email').props.value).toBe('a@b.co');
    expect(screen.getByLabelText('Password').props.value).toBe('nope');
  });
});

describe('sign up', () => {
  async function openSignUp(client: AuthClient) {
    renderAccount(client);
    fireEvent.press(await screen.findByRole('button', { name: 'Create an account' }));
    await screen.findByLabelText('Your name');
  }

  it('saves the name after the account is created', async () => {
    const client = stubClient();
    client.getSession.mockResolvedValueOnce({ status: 'signed_out' }).mockResolvedValue(signedIn);
    await openSignUp(client);
    type('Your name', ' Sam ');
    type('Email', 'sam@x.co');
    type('Password', 'a-long-password');
    fireEvent.press(screen.getByRole('button', { name: 'Create account' }));
    await waitFor(() => expect(client.updateProfile).toHaveBeenCalledWith({ senderName: 'Sam' }));
    expect(client.signUp).toHaveBeenCalledWith('sam@x.co', 'a-long-password');
    await screen.findByDisplayValue('Sam');
  });

  it('shows the duplicate-email copy and keeps the fields', async () => {
    const client = stubClient({ signUp: jest.fn(async () => ({ ok: false, reason: 'email_taken' })) });
    await openSignUp(client);
    type('Your name', 'Sam');
    type('Email', 'sam@x.co');
    type('Password', 'a-long-password');
    fireEvent.press(screen.getByRole('button', { name: 'Create account' }));
    await screen.findByText('This email already has an account. Sign in instead.');
    expect(screen.getByLabelText('Your name').props.value).toBe('Sam');
    expect(screen.getByLabelText('Email').props.value).toBe('sam@x.co');
    expect(screen.getByLabelText('Password').props.value).toBe('a-long-password');
    expect(client.updateProfile).not.toHaveBeenCalled();
  });

  it('keeps the fields when offline', async () => {
    const client = stubClient({ signUp: jest.fn(async () => ({ ok: false, reason: 'offline' })) });
    await openSignUp(client);
    type('Your name', 'Sam');
    type('Email', 'sam@x.co');
    type('Password', 'a-long-password');
    fireEvent.press(screen.getByRole('button', { name: 'Create account' }));
    await screen.findByText("You need a connection to do this. Nothing you've typed is lost.");
    expect(screen.getByLabelText('Email').props.value).toBe('sam@x.co');
    expect(screen.getByLabelText('Password').props.value).toBe('a-long-password');
  });

  it('disables submit while the request is pending', async () => {
    let finish: (r: SignUpResult) => void = () => undefined;
    const client = stubClient({ signUp: jest.fn(() => new Promise<SignUpResult>((r) => (finish = r))) });
    await openSignUp(client);
    type('Email', 'sam@x.co');
    type('Password', 'a-long-password');
    fireEvent.press(screen.getByRole('button', { name: 'Create account' }));
    const busy = await screen.findByRole('button', { name: 'Creating account' });
    expect(busy.props.accessibilityState).toMatchObject({ disabled: true, busy: true });
    fireEvent.press(busy);
    expect(client.signUp).toHaveBeenCalledTimes(1);
    finish({ ok: false, reason: 'failed' });
    await screen.findByRole('button', { name: 'Create account' });
  });

  it('asks the person to check their email when no session comes back', async () => {
    const client = stubClient();
    await openSignUp(client);
    type('Email', 'sam@x.co');
    type('Password', 'a-long-password');
    fireEvent.press(screen.getByRole('button', { name: 'Create account' }));
    await screen.findByText('Please check your email to finish setting up your account.');
    expect(client.updateProfile).not.toHaveBeenCalled();
  });
});

describe('profile', () => {
  it('edits and saves the sender name', async () => {
    const client = stubClient({
      getSession: jest.fn(async () => signedIn),
      getProfile: jest.fn(async () => profileWith('Sam')),
    });
    renderAccount(client);
    const input = await screen.findByDisplayValue('Sam');
    fireEvent.changeText(input, 'Samantha');
    fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    await screen.findByText('Saved.');
    expect(client.updateProfile).toHaveBeenCalledWith({ senderName: 'Samantha' });
  });

  it('shows the error and keeps the typed name when saving fails', async () => {
    const client = stubClient({
      getSession: jest.fn(async () => signedIn),
      updateProfile: jest.fn(async () => ({ ok: false, reason: 'offline' })),
    });
    renderAccount(client);
    const input = await screen.findByLabelText('Your name');
    fireEvent.changeText(input, 'Samantha');
    fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    await screen.findByText("You need a connection to do this. Nothing you've typed is lost.");
    expect(screen.getByLabelText('Your name').props.value).toBe('Samantha');
  });
});
