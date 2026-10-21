import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { AccessibilityInfo, Platform, StyleSheet, Text } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { AuthClient, ProfileResult, SessionState, SignInResult, SignUpResult } from '@griever/api-client/auth';
import { AccountScreen, resetUnsavedName } from './AccountScreen';
import { CHECKLIST_KEY } from './WhatYoullNeedScreen';
import { AccountProvider, useAccount } from '../lib/AccountProvider';

// Jest has no native view tree, so the real findNodeHandle returns null for every component. The
// heading focus test needs a handle to exist; only this one function is replaced.
// This path is specific to react-native 0.81 (Expo SDK 54). Re-check it when react-native is upgraded.
jest.mock('react-native/Libraries/ReactNative/RendererProxy', () => ({
  ...jest.requireActual<object>('react-native/Libraries/ReactNative/RendererProxy'),
  findNodeHandle: () => 1,
}));

const signedIn: SessionState = { status: 'signed_in', session: { userId: 'u1', email: 'a@b.co', accessToken: 't' } };
const noProfile: ProfileResult = { ok: false, reason: 'no_profile' };
const profileWith = (senderName: string | null): ProfileResult => ({
  ok: true,
  profile: { senderName, contactSource: null } as never,
});
const OFFLINE = "You need a connection to do this. Nothing you've typed is lost.";

function stubClient(overrides: Partial<Record<keyof AuthClient, unknown>> = {}) {
  const client = {
    signUp: jest.fn(async (): Promise<SignUpResult> => ({ ok: true, userId: 'u1' })),
    signIn: jest.fn(async (): Promise<SignInResult> => ({ ok: true, userId: 'u1' })),
    signOut: jest.fn(async () => ({ ok: true as const, serverRevoked: true })),
    getSession: jest.fn(async (): Promise<SessionState> => ({ status: 'signed_out' })),
    refreshSession: jest.fn(async (): Promise<SessionState> => ({ status: 'signed_out' })),
    startAutoRefresh: jest.fn(async () => undefined),
    stopAutoRefresh: jest.fn(async () => undefined),
    getProfile: jest.fn(async (): Promise<ProfileResult> => noProfile),
    updateProfile: jest.fn(async (u: { senderName?: string | null }): Promise<ProfileResult> => profileWith(u.senderName ?? '')),
  };
  Object.assign(client, overrides);
  return client as unknown as AuthClient & typeof client;
}

/** A client that is signed out until a sign-in or sign-up, then signed in. */
function clientSignedInAfterAuth(overrides: Partial<Record<keyof AuthClient, unknown>> = {}) {
  const client = stubClient(overrides);
  client.getSession.mockResolvedValueOnce({ status: 'signed_out' }).mockResolvedValue(signedIn);
  return client;
}

function renderAccount(client: AuthClient | null) {
  return render(
    <AccountProvider client={client}>
      <AccountScreen onBack={() => undefined} />
    </AccountProvider>,
  );
}

const type = (label: string, text: string) => fireEvent.changeText(screen.getByLabelText(label), text);
const press = (name: string) => fireEvent.press(screen.getByRole('button', { name }));
const value = (label: string) => screen.getByLabelText(label).props.value;

beforeEach(() => {
  resetUnsavedName();
  jest.restoreAllMocks();
});

describe('missing configuration', () => {
  it('shows the calm unavailable state under a header', () => {
    renderAccount(null);
    expect(screen.getByRole('header', { name: 'Your account' })).toBeTruthy();
    expect(screen.getByText("Accounts aren't available right now.")).toBeTruthy();
  });
});

describe('sign in', () => {
  it('signs in and shows the profile', async () => {
    const client = clientSignedInAfterAuth({ getProfile: jest.fn(async () => profileWith('Sam')) });
    renderAccount(client);
    await screen.findByLabelText('Email');
    type('Email', ' a@b.co ');
    type('Password', 'secret-pass');
    press('Sign in');
    await screen.findByDisplayValue('Sam');
    expect(screen.getByRole('header', { name: 'Your account' })).toBeTruthy();
    expect(client.signIn).toHaveBeenCalledWith('a@b.co', 'secret-pass');
  });

  it('asks for a name when the account has none', async () => {
    const client = clientSignedInAfterAuth({ getProfile: jest.fn(async () => profileWith(null)) });
    renderAccount(client);
    await screen.findByLabelText('Email');
    type('Email', 'a@b.co');
    type('Password', 'secret-pass');
    press('Sign in');
    await screen.findByRole('header', { name: 'What should we call you?' });
    expect(screen.getByText('This is the name on your account.')).toBeTruthy();
  });

  it('keeps the typed fields and shows the hook copy on a wrong password', async () => {
    const client = stubClient({ signIn: jest.fn(async () => ({ ok: false, reason: 'invalid_credentials' })) });
    renderAccount(client);
    await screen.findByLabelText('Email');
    type('Email', 'a@b.co');
    type('Password', 'nope');
    press('Sign in');
    await screen.findByText("That email and password don't match. Please try again.");
    expect(value('Email')).toBe('a@b.co');
    expect(value('Password')).toBe('nope');
  });

  it('does not carry the error over to the sign-up screen', async () => {
    const client = stubClient({ signIn: jest.fn(async () => ({ ok: false, reason: 'invalid_credentials' })) });
    renderAccount(client);
    await screen.findByLabelText('Email');
    press('Sign in');
    await screen.findByText("That email and password don't match. Please try again.");
    press('Create an account');
    await screen.findByLabelText('Your name');
    expect(screen.queryByText("That email and password don't match. Please try again.")).toBeNull();
  });
});

describe('sign up', () => {
  async function openSignUp(client: AuthClient) {
    renderAccount(client);
    fireEvent.press(await screen.findByRole('button', { name: 'Create an account' }));
    await screen.findByLabelText('Your name');
  }
  function fill(name = 'Sam', password = 'a-long-password') {
    type('Your name', name);
    type('Email', 'sam@x.co');
    type('Password', password);
  }

  it('saves the name after the account is created', async () => {
    const client = clientSignedInAfterAuth();
    await openSignUp(client);
    fill(' Sam ');
    press('Create account');
    await waitFor(() => expect(client.updateProfile).toHaveBeenCalledWith({ senderName: 'Sam' }));
    expect(client.signUp).toHaveBeenCalledWith('sam@x.co', 'a-long-password');
    await screen.findByDisplayValue('Sam');
  });

  it('never applies the sign-up name to a different account', async () => {
    const client = stubClient();
    await openSignUp(client);
    type('Your name', 'Sam');
    type('Email', 'a@x.co');
    type('Password', 'a-long-password');
    press('Create account');
    await screen.findByText('Please check your email to finish setting up your account.');
    // Someone else signs in on this phone.
    client.getSession.mockResolvedValue(signedIn);
    press('Sign in');
    await screen.findByLabelText('Email');
    type('Email', 'b@x.co');
    type('Password', 'another-password');
    press('Sign in');
    await screen.findByRole('header', { name: 'What should we call you?' });
    expect(client.updateProfile).not.toHaveBeenCalled();
    expect(value('Your name')).toBe('');
  });

  it('still saves the sign-up name when the same email signs in after confirming', async () => {
    const client = stubClient();
    await openSignUp(client);
    fill();
    press('Create account');
    await screen.findByText('Please check your email to finish setting up your account.');
    client.getSession.mockResolvedValue(signedIn);
    press('Sign in');
    await screen.findByLabelText('Email');
    type('Email', ' SAM@x.co ');
    type('Password', 'a-long-password');
    press('Sign in');
    await waitFor(() => expect(client.updateProfile).toHaveBeenCalledWith({ senderName: 'Sam' }));
  });

  it('does not let an old unsaved name overwrite a newer saved one', async () => {
    const client = clientSignedInAfterAuth({
      updateProfile: jest
        .fn<(u: { senderName?: string | null }) => Promise<ProfileResult>>()
        .mockResolvedValueOnce({ ok: false, reason: 'offline' })
        .mockImplementation(async (u) => profileWith(u.senderName ?? '')),
    });
    await openSignUp(client);
    fill();
    press('Create account');
    await screen.findByText(OFFLINE);
    type('Your name', 'Samantha');
    press('Save');
    await screen.findByText('Saved.');
    screen.unmount();
    renderAccount(client);
    await screen.findByLabelText('Your name');
    expect(screen.queryByDisplayValue('Sam')).toBeNull();
    expect(client.updateProfile.mock.calls.map((c) => c[0])).toEqual([{ senderName: 'Sam' }, { senderName: 'Samantha' }]);
  });

  it('asks for a name when the profile still has none after sign-up', async () => {
    const client = clientSignedInAfterAuth({ updateProfile: jest.fn(async () => profileWith('')) });
    await openSignUp(client);
    fill();
    press('Create account');
    await screen.findByRole('header', { name: 'What should we call you?' });
  });

  it('keeps the typed name in the field when saving it fails', async () => {
    const client = clientSignedInAfterAuth({ updateProfile: jest.fn(async () => ({ ok: false, reason: 'offline' })) });
    await openSignUp(client);
    fill();
    press('Create account');
    await screen.findByText(OFFLINE);
    expect(value('Your name')).toBe('Sam');
    expect(screen.getByRole('header', { name: 'Your account' })).toBeTruthy();
  });

  it('shows the duplicate-email copy and keeps the fields', async () => {
    const client = stubClient({ signUp: jest.fn(async () => ({ ok: false, reason: 'email_taken' })) });
    await openSignUp(client);
    fill();
    press('Create account');
    await screen.findByText('This email already has an account. Sign in instead.');
    expect(value('Your name')).toBe('Sam');
    expect(value('Email')).toBe('sam@x.co');
    expect(value('Password')).toBe('a-long-password');
    expect(client.updateProfile).not.toHaveBeenCalled();
  });

  it('keeps the fields when offline', async () => {
    const client = stubClient({ signUp: jest.fn(async () => ({ ok: false, reason: 'offline' })) });
    await openSignUp(client);
    fill();
    press('Create account');
    await screen.findByText(OFFLINE);
    expect(value('Email')).toBe('sam@x.co');
    expect(value('Password')).toBe('a-long-password');
  });

  it('shows the password hint and attaches it to the input', async () => {
    await openSignUp(stubClient());
    expect(screen.getByText('Use at least 8 characters.', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.getByLabelText('Password').props.accessibilityHint).toBe('Use at least 8 characters.');
  });

  it('does not call the network for a short password', async () => {
    const client = stubClient();
    await openSignUp(client);
    fill('Sam', 'short');
    press('Create account');
    await screen.findByText('Please choose a password with at least 8 characters.');
    expect(client.signUp).not.toHaveBeenCalled();
    expect(value('Password')).toBe('short');
  });

  it('does not call the network for a name of only spaces', async () => {
    const client = stubClient();
    await openSignUp(client);
    fill('   ');
    press('Create account');
    await screen.findByText('Please enter your name.');
    expect(client.signUp).not.toHaveBeenCalled();
  });

  it('disables submit while the request is pending', async () => {
    let finish: (r: SignUpResult) => void = () => undefined;
    const client = stubClient({ signUp: jest.fn(() => new Promise<SignUpResult>((r) => (finish = r))) });
    await openSignUp(client);
    fill();
    press('Create account');
    const busy = await screen.findByRole('button', { name: 'Creating account' });
    expect(busy.props.accessibilityState).toMatchObject({ disabled: true, busy: true });
    fireEvent.press(busy);
    expect(client.signUp).toHaveBeenCalledTimes(1);
    finish({ ok: false, reason: 'failed' });
    await screen.findByRole('button', { name: 'Create account' });
  });

  it('asks the person to check their email, announces it and moves focus', async () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
    const focus = jest.spyOn(AccessibilityInfo, 'setAccessibilityFocus');
    const client = stubClient();
    await openSignUp(client);
    fill();
    focus.mockClear();
    press('Create account');
    await screen.findByText('Please check your email to finish setting up your account.');
    expect(screen.getByRole('header', { name: 'Check your email' })).toBeTruthy();
    expect(announce).toHaveBeenCalledWith('Please check your email to finish setting up your account.');
    expect(focus).toHaveBeenCalledTimes(1);
    expect(client.updateProfile).not.toHaveBeenCalled();
  });
});

describe('AccountProvider', () => {
  it('renders the app right away while the profile cache loads', () => {
    jest.spyOn(AsyncStorage, 'getItem').mockReturnValue(new Promise(() => undefined));
    function Probe() {
      return <Text>{`app visible, accounts ${useAccount()?.status}`}</Text>;
    }
    render(
      <AccountProvider client={stubClient()}>
        <Probe />
      </AccountProvider>,
    );
    expect(screen.getByText('app visible, accounts loading')).toBeTruthy();
  });
});

describe('announcements', () => {
  it('announces errors on iOS only', async () => {
    const run = async () => {
      const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
      announce.mockClear();
      renderAccount(stubClient({ signIn: jest.fn(async () => ({ ok: false, reason: 'offline' })) }));
      await screen.findByLabelText('Email');
      press('Sign in');
      await screen.findByText(OFFLINE);
      return announce;
    };
    expect(await run()).toHaveBeenCalledWith(OFFLINE);
    screen.unmount();
    jest.restoreAllMocks();
    jest.replaceProperty(Platform, 'OS', 'android');
    expect(await run()).not.toHaveBeenCalled();
  });
});

describe('profile', () => {
  const signedInClient = (overrides: Partial<Record<keyof AuthClient, unknown>> = {}) =>
    stubClient({ getSession: jest.fn(async () => signedIn), getProfile: jest.fn(async () => profileWith('Sam')), ...overrides });

  it('edits and saves the sender name', async () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
    announce.mockClear();
    const client = signedInClient();
    renderAccount(client);
    fireEvent.changeText(await screen.findByDisplayValue('Sam'), 'Samantha');
    press('Save');
    await screen.findByText('Saved.');
    expect(client.updateProfile).toHaveBeenCalledWith({ senderName: 'Samantha' });
    expect(announce).toHaveBeenCalledWith('Saved.');
  });

  it('shows "Saved." on the first save, when the account had no profile yet', async () => {
    const client = signedInClient({ getProfile: jest.fn(async () => noProfile) });
    renderAccount(client);
    await screen.findByRole('header', { name: 'What should we call you?' });
    type('Your name', 'Sam');
    press('Save');
    await screen.findByText('Saved.');
    expect(value('Your name')).toBe('Sam');
  });

  it('shows the error and keeps the typed name when saving fails', async () => {
    const client = signedInClient({ updateProfile: jest.fn(async () => ({ ok: false, reason: 'offline' })) });
    renderAccount(client);
    fireEvent.changeText(await screen.findByDisplayValue('Sam'), 'Samantha');
    press('Save');
    await screen.findByText(OFFLINE);
    expect(value('Your name')).toBe('Samantha');
  });

  it('does not save a name of only spaces', async () => {
    const client = signedInClient();
    renderAccount(client);
    fireEvent.changeText(await screen.findByDisplayValue('Sam'), '   ');
    press('Save');
    await screen.findByText('Please enter your name.');
    expect(client.updateProfile).not.toHaveBeenCalled();
  });

  it('uses the new offline copy', async () => {
    renderAccount(signedInClient({ getSession: jest.fn(async () => ({ status: 'offline' })) }));
    await screen.findByText('You are offline. You can change your name when you are connected.');
  });

  it('keeps the view, the note and the typed name when the server ends the session', async () => {
    const client = signedInClient({ updateProfile: jest.fn(async () => ({ ok: false, reason: 'signed_out' })) });
    renderAccount(client);
    fireEvent.changeText(await screen.findByDisplayValue('Sam'), 'Samantha');
    press('Save');
    await screen.findByText("You've been signed out. Your work on this device is safe. Sign in again when you're ready.");
    expect(value('Your name')).toBe('Samantha');
    press('Sign in');
    await screen.findByLabelText('Email');
    expect(screen.getByRole('header', { name: 'Sign in' })).toBeTruthy();
  });

  it('goes to sign in without the note after an explicit sign out', async () => {
    renderAccount(signedInClient());
    await screen.findByDisplayValue('Sam');
    press('Sign out');
    await screen.findByLabelText('Email');
    expect(screen.queryByText(/You've been signed out/)).toBeNull();
  });

  describe("What you'll need on Your account (#191)", () => {
    const row = (name: string) => screen.getByRole('checkbox', { name: new RegExp(`^${name}`) });

    it('lists the items as checkboxes of at least 44 high, unticked to start', async () => {
      await AsyncStorage.clear();
      renderAccount(signedInClient());
      await screen.findByDisplayValue('Sam');
      expect(screen.getByRole('header', { name: "What you'll need" })).toBeTruthy();
      const boxes = await screen.findAllByRole('checkbox');
      expect(boxes).toHaveLength(5);
      for (const box of boxes) expect(box.props.accessibilityState).toEqual({ checked: false });
      expect(StyleSheet.flatten(row('Life insurance policies').props.style).minHeight).toBeGreaterThanOrEqual(44);
    });

    it('saves a tick with the same key as the checklist screen', async () => {
      await AsyncStorage.clear();
      renderAccount(signedInClient());
      await screen.findAllByRole('checkbox');
      fireEvent.press(row('Life insurance policies'));
      expect(row('Life insurance policies').props.accessibilityState).toEqual({ checked: true });
      await waitFor(async () => expect(await AsyncStorage.getItem(CHECKLIST_KEY)).toBe('["insurance"]'));
    });

    it('leaves the list out while the account asks for a name', async () => {
      renderAccount(signedInClient({ getProfile: jest.fn(async () => profileWith(null)) }));
      await screen.findByRole('header', { name: 'What should we call you?' });
      expect(screen.queryByRole('checkbox')).toBeNull();
    });
  });
});
