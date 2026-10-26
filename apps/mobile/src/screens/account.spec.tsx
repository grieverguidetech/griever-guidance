import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { useState } from 'react';
import { AccessibilityInfo, Platform, StyleSheet, Text } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ProfileResult } from '@griever/api-client';
import type { AccountAuth } from '@griever/shared';
import { AccountScreen, resetUnsavedName } from './AccountScreen';
import { CHECKLIST_KEY, SSN_TIP } from './WhatYoullNeedScreen';
import { AccountProvider, AccountStateProvider, useAccount } from '../lib/AccountProvider';

// Jest has no native view tree, so the real findNodeHandle returns null for every component. The
// heading focus test needs a handle to exist; only this one function is replaced.
// This path is specific to react-native 0.81 (Expo SDK 54). Re-check it when react-native is upgraded.
jest.mock('react-native/Libraries/ReactNative/RendererProxy', () => ({
  ...jest.requireActual<object>('react-native/Libraries/ReactNative/RendererProxy'),
  findNodeHandle: () => 1,
}));

// The profile calls go through the gateway; here they are plain functions.
const mockGetProfile = jest.fn<() => Promise<ProfileResult>>();
const mockUpdateProfile = jest.fn<(token: string, u: { senderName?: string | null }) => Promise<ProfileResult>>();
jest.mock('@griever/api-client', () => ({
  ...jest.requireActual<object>('@griever/api-client'),
  getProfile: () => mockGetProfile(),
  updateProfile: (token: string, u: { senderName?: string | null }) => mockUpdateProfile(token, u),
}));

// Clerk's screens-side hooks. `finalize` signs the fake auth in, the way Clerk's finalize starts the session.
const mockAuthControl: { setSignedIn: (v: boolean) => void } = { setSignedIn: () => undefined };
const mockSignIn = {
  status: 'complete',
  password: jest.fn(async () => ({ error: null })),
  finalize: jest.fn(async () => ({ error: null as unknown })),
  reset: jest.fn(),
};
const mockSignUp = {
  status: 'complete',
  password: jest.fn(async () => ({ error: null })),
  verifications: { sendEmailCode: jest.fn(async () => ({ error: null })), verifyEmailCode: jest.fn(async () => ({ error: null })) },
  finalize: jest.fn(async () => ({ error: null as unknown })),
};
jest.mock('@clerk/expo', () => ({
  useSignIn: () => ({ signIn: mockSignIn }),
  useSignUp: () => ({ signUp: mockSignUp }),
  useSSO: () => ({ startSSOFlow: jest.fn() }),
}));
jest.mock('expo-auth-session', () => ({ makeRedirectUri: () => 'mobile://sso-callback' }));

const profileWith = (senderName: string | null): ProfileResult => ({
  ok: true,
  profile: { id: 'u1', senderName, contactSource: null, accountType: 'owner', createdAt: 'x', updatedAt: 'x' },
});
const noProfile: ProfileResult = { ok: false, reason: 'no_profile' };
const OFFLINE = "You need a connection to do this. Nothing you've typed is lost.";

/** Fake sign-in provider: signed out until a screen finalizes, loading while `loading`. */
function Harness({ initial = false, children }: { initial?: boolean; children: React.ReactNode }) {
  const [signedIn, setSignedIn] = useState(initial);
  mockAuthControl.setSignedIn = setSignedIn;
  const auth: AccountAuth = {
    status: signedIn ? 'signed_in' : 'signed_out',
    userId: signedIn ? 'u1' : null,
    getToken: async () => (signedIn ? { ok: true, token: 't' } : { ok: false, reason: 'signed_out' }),
    signOut: async () => setSignedIn(false),
  };
  return <AccountStateProvider auth={auth}>{children}</AccountStateProvider>;
}

function renderAccount(initial = false) {
  return render(
    <Harness initial={initial}>
      <AccountScreen onBack={() => undefined} />
    </Harness>,
  );
}

const type = (label: string, text: string) => fireEvent.changeText(screen.getByLabelText(label), text);
const press = (name: string) => fireEvent.press(screen.getByRole('button', { name }));
const value = (label: string) => screen.getByLabelText(label).props.value;
const finalizeSignsIn = (fn: typeof mockSignIn.finalize) => fn.mockImplementation(async () => (act(() => mockAuthControl.setSignedIn(true)), { error: null }));

beforeEach(async () => {
  resetUnsavedName();
  jest.restoreAllMocks();
  await AsyncStorage.clear();
  mockGetProfile.mockReset().mockResolvedValue(noProfile);
  mockUpdateProfile.mockReset().mockImplementation(async (_t, u) => profileWith(u.senderName ?? ''));
  mockSignIn.finalize.mockReset();
  mockSignUp.finalize.mockReset();
  mockSignIn.finalize.mockResolvedValue({ error: null });
  mockSignUp.finalize.mockResolvedValue({ error: null });
  finalizeSignsIn(mockSignIn.finalize);
  finalizeSignsIn(mockSignUp.finalize);
});

describe('missing configuration', () => {
  it('shows the calm unavailable state under a header', () => {
    render(
      <AccountProvider>
        <AccountScreen onBack={() => undefined} />
      </AccountProvider>,
    );
    expect(screen.getByRole('heading', { name: 'Your account' })).toBeTruthy();
    expect(screen.getByText("Accounts aren't available right now.")).toBeTruthy();
  });
});

describe('sign in', () => {
  it('shows the profile once Clerk has signed the person in', async () => {
    mockGetProfile.mockResolvedValue(profileWith('Sam'));
    renderAccount();
    await screen.findByLabelText('Email');
    type('Email', 'a@b.co');
    type('Password', 'secret-pass');
    press('Sign in');
    await screen.findByDisplayValue('Sam');
    expect(screen.getByRole('heading', { name: 'Your account' })).toBeTruthy();
  });

  it('asks for a name when the account has none', async () => {
    mockGetProfile.mockResolvedValue(profileWith(null));
    renderAccount();
    await screen.findByLabelText('Email');
    press('Sign in');
    await screen.findByRole('heading', { name: 'What should we call you?' });
    expect(screen.getByText('This is the name on your account.')).toBeTruthy();
  });

  it('does not carry the error over to the sign-up screen', async () => {
    mockSignIn.password.mockResolvedValueOnce({ error: { code: 'form_password_incorrect' } } as never);
    renderAccount();
    await screen.findByLabelText('Email');
    press('Sign in');
    await screen.findByText("That email and password don't match. Please try again.");
    press('Create an account');
    await screen.findByLabelText('Your name');
    expect(screen.queryByText("That email and password don't match. Please try again.")).toBeNull();
  });

  it('announces errors on iOS only', async () => {
    const run = async () => {
      const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
      announce.mockClear();
      mockSignIn.password.mockResolvedValueOnce({ error: { code: 'network_error' } } as never);
      renderAccount();
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

describe('sign up', () => {
  async function openSignUp() {
    renderAccount();
    fireEvent.press(await screen.findByRole('button', { name: 'Create an account' }));
    await screen.findByLabelText('Your name');
  }
  async function createAccount(name = 'Sam', email = 'sam@x.co') {
    type('Your name', name);
    type('Email', email);
    type('Password', 'a-long-password');
    press('Create account');
    await screen.findByLabelText('6-digit code');
    type('6-digit code', '123456');
    await act(async () => press('Create account'));
  }

  it('saves the name after the account is created', async () => {
    await openSignUp();
    await createAccount(' Sam ');
    await waitFor(() => expect(mockUpdateProfile).toHaveBeenCalledWith('t', { senderName: 'Sam' }));
    await screen.findByDisplayValue('Sam');
  });

  it('never applies the sign-up name to a different account', async () => {
    mockSignUp.finalize.mockResolvedValueOnce({ error: { code: 'network_error' } });
    await openSignUp();
    await createAccount();
    await screen.findByText(OFFLINE);
    // Someone else signs in on this phone.
    press('Use a different email');
    press('I already have an account');
    await screen.findByLabelText('Password');
    type('Email', 'b@x.co');
    type('Password', 'another-password');
    press('Sign in');
    await screen.findByRole('heading', { name: 'What should we call you?' });
    expect(mockUpdateProfile).not.toHaveBeenCalled();
    expect(value('Your name')).toBe('');
  });

  it('does not let an old unsaved name overwrite a newer saved one', async () => {
    mockUpdateProfile.mockResolvedValueOnce({ ok: false, reason: 'offline' });
    await openSignUp();
    await createAccount();
    await screen.findByText(OFFLINE);
    type('Your name', 'Samantha');
    press('Save');
    await screen.findByText('Saved.');
    screen.unmount();
    renderAccount(true);
    await screen.findByLabelText('Your name');
    expect(screen.queryByDisplayValue('Sam')).toBeNull();
    expect(mockUpdateProfile.mock.calls.map((c) => c[1])).toEqual([{ senderName: 'Sam' }, { senderName: 'Samantha' }]);
  });

  it('asks for a name when the profile still has none after sign-up', async () => {
    mockUpdateProfile.mockResolvedValue(profileWith(''));
    await openSignUp();
    await createAccount();
    await screen.findByRole('heading', { name: 'What should we call you?' });
  });

  it('keeps the typed name in the field when saving it fails', async () => {
    mockUpdateProfile.mockResolvedValue({ ok: false, reason: 'offline' });
    await openSignUp();
    await createAccount();
    await screen.findByText(OFFLINE);
    expect(value('Your name')).toBe('Sam');
    expect(screen.getByRole('heading', { name: 'Your account' })).toBeTruthy();
  });
});

describe('AccountStateProvider', () => {
  it('renders the app right away while the profile cache loads', () => {
    jest.spyOn(AsyncStorage, 'getItem').mockReturnValue(new Promise(() => undefined));
    function Probe() {
      return <Text>{`app visible, accounts ${useAccount()?.status}`}</Text>;
    }
    render(
      <Harness initial>
        <Probe />
      </Harness>,
    );
    expect(screen.getByText('app visible, accounts loading')).toBeTruthy();
  });
});

describe('profile', () => {
  beforeEach(() => {
    mockGetProfile.mockResolvedValue(profileWith('Sam'));
  });

  it('edits and saves the sender name', async () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
    announce.mockClear();
    renderAccount(true);
    fireEvent.changeText(await screen.findByDisplayValue('Sam'), 'Samantha');
    press('Save');
    await screen.findByText('Saved.');
    expect(mockUpdateProfile).toHaveBeenCalledWith('t', { senderName: 'Samantha' });
    expect(announce).toHaveBeenCalledWith('Saved.');
  });

  it('shows "Saved." on the first save, when the account had no profile yet', async () => {
    mockGetProfile.mockResolvedValue(noProfile);
    renderAccount(true);
    await screen.findByRole('heading', { name: 'What should we call you?' });
    type('Your name', 'Sam');
    press('Save');
    await screen.findByText('Saved.');
    expect(value('Your name')).toBe('Sam');
  });

  it('shows the error and keeps the typed name when saving fails', async () => {
    mockUpdateProfile.mockResolvedValue({ ok: false, reason: 'offline' });
    renderAccount(true);
    fireEvent.changeText(await screen.findByDisplayValue('Sam'), 'Samantha');
    press('Save');
    await screen.findByText(OFFLINE);
    expect(value('Your name')).toBe('Samantha');
  });

  it('does not save a name of only spaces', async () => {
    renderAccount(true);
    fireEvent.changeText(await screen.findByDisplayValue('Sam'), '   ');
    press('Save');
    await screen.findByText('Please enter your name.');
    expect(mockUpdateProfile).not.toHaveBeenCalled();
  });

  it('uses the offline copy when the profile cannot be fetched', async () => {
    mockGetProfile.mockResolvedValue({ ok: false, reason: 'offline' });
    renderAccount(true);
    await screen.findByText('You are offline. You can change your name when you are connected.');
  });

  it('keeps the view, the note and the typed name when the session ends', async () => {
    renderAccount(true);
    fireEvent.changeText(await screen.findByDisplayValue('Sam'), 'Samantha');
    act(() => mockAuthControl.setSignedIn(false));
    await screen.findByText("You've been signed out. Your work on this device is safe. Sign in again when you're ready.");
    expect(value('Your name')).toBe('Samantha');
    press('Sign in');
    await screen.findByLabelText('Email');
    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeTruthy();
  });

  it('goes to sign in without the note after an explicit sign out', async () => {
    renderAccount(true);
    await screen.findByDisplayValue('Sam');
    press('Sign out');
    await screen.findByLabelText('Email');
    expect(screen.queryByText(/You've been signed out/)).toBeNull();
  });

  describe("What you'll need on Your account (#191)", () => {
    const row = (name: string) => screen.getByRole('checkbox', { name: new RegExp(`^${name}`) });

    it('lists the items as checkboxes of at least 44 high, unticked to start', async () => {
      renderAccount(true);
      await screen.findByDisplayValue('Sam');
      expect(screen.getByRole('header', { name: "What you'll need" })).toBeTruthy();
      const boxes = await screen.findAllByRole('checkbox');
      expect(boxes).toHaveLength(5);
      for (const box of boxes) {
        expect(box.props.accessibilityState).toEqual({ checked: false });
      }
      expect(StyleSheet.flatten(row('Life insurance policies').props.style).minHeight).toBeGreaterThanOrEqual(44);
    });

    it('saves a tick with the same key as the checklist screen', async () => {
      renderAccount(true);
      await screen.findAllByRole('checkbox');
      fireEvent.press(row('Life insurance policies'));
      expect(row('Life insurance policies').props.accessibilityState).toEqual({ checked: true });
      await waitFor(async () => expect(await AsyncStorage.getItem(CHECKLIST_KEY)).toBe('["insurance"]'));
    });

    it('closes an open tip on a touch elsewhere, such as Save', async () => {
      renderAccount(true);
      await screen.findAllByRole('checkbox');
      fireEvent.press(screen.getByRole('button', { name: 'Why we list this' }));
      expect(screen.getByText(SSN_TIP)).toBeTruthy();
      fireEvent(screen.getByRole('button', { name: 'Save' }), 'touchStart');
      expect(screen.queryByText(SSN_TIP)).toBeNull();
    });

    it('shows the list when the name came from the account, with nothing typed here', async () => {
      mockGetProfile.mockResolvedValue(profileWith('Server Name'));
      renderAccount(true);
      await screen.findByDisplayValue('Server Name');
      expect(await screen.findAllByRole('checkbox')).toHaveLength(5);
    });

    it('leaves the list out while the account asks for a name', async () => {
      mockGetProfile.mockResolvedValue(profileWith(null));
      renderAccount(true);
      await screen.findByRole('heading', { name: 'What should we call you?' });
      expect(screen.queryByRole('checkbox')).toBeNull();
    });
  });
});
