import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { useState } from 'react';
import { AccessibilityInfo, Linking, Platform, StyleSheet, Text } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, configure, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ProfileResult } from '@griever/api-client';
import { screenCopy } from '@griever/copy';
import type { AccountAuth, Address } from '@griever/shared';
import { AccountScreen, resetUnsavedName } from './AccountScreen';
import { CHECKLIST_KEY } from './WhatYoullNeedScreen';
import { ClerkBoundary, DeleteCancelledError, DeleteNeedsSignInError } from '../lib/clerk';
import { onAccountDeleted } from '../lib/deleteLocalData';
import { SIGNED_IN_STORAGE_KEY } from '@griever/hooks';
import { AccountProvider, AccountStateProvider, useAccount, useLaunchState } from '../lib/AccountProvider';

// On a cold Babel cache (a fresh worktree) the first sign-in render compiles modules lazily and
// takes longer than the 1s default for findBy*. 10s is still a clear hang signal (#404).
configure({ asyncUtilTimeout: 10_000 });

// Jest has no native view tree, so the real findNodeHandle returns null for every component. The
// heading focus test needs a handle to exist; only this one function is replaced.
// This path is specific to react-native 0.81 (Expo SDK 54). Re-check it when react-native is upgraded.
jest.mock('react-native/Libraries/ReactNative/RendererProxy', () => ({
  ...jest.requireActual<object>('react-native/Libraries/ReactNative/RendererProxy'),
  findNodeHandle: () => 1,
}));

// The profile calls go through the gateway; here they are plain functions.
const mockGetProfile = jest.fn<() => Promise<ProfileResult>>();
type ProfileUpdate = { senderName?: string | null; firstName?: string | null; lastName?: string | null; birthDate?: string | null; address?: Address | null };
const mockUpdateProfile = jest.fn<(token: string, u: ProfileUpdate) => Promise<ProfileResult>>();
jest.mock('@griever/api-client', () => ({
  ...jest.requireActual<object>('@griever/api-client'),
  getProfile: () => mockGetProfile(),
  updateProfile: (token: string, u: ProfileUpdate) => mockUpdateProfile(token, u),
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
const mockClerkUser: { email: string | null } = { email: null };
// Stands in for Clerk's useReverification wrapper: by default it just runs the call.
let mockReverify: (fn: (...args: never[]) => unknown, options: { onNeedsReverification?: (h: { cancel: () => void }) => void } | undefined, args: never[]) => Promise<unknown> = async (fn, _options, args) => fn(...args); // eslint-disable-line prefer-const
const mockClerkInstance: { loaded: boolean; buildUserProfileUrl: () => string } = { loaded: true, buildUserProfileUrl: () => 'https://accounts.example.com/user' };
jest.mock('@clerk/expo/token-cache', () => ({ tokenCache: undefined }));
jest.mock('@clerk/expo/resource-cache', () => ({ resourceCache: undefined }));
jest.mock('expo-web-browser', () => ({ openBrowserAsync: jest.fn(async () => ({ type: 'dismiss' })) }));
// The sign-in info the screen reads comes from Clerk through the bridge in lib/clerk.tsx; the tests below set it on these fakes.
let mockSignInInfo: { email: string | null; manageUrl: string | null; deleteAccount: (() => Promise<void>) | null } = { email: null, manageUrl: null, deleteAccount: null };
jest.mock('../lib/clerk', () => ({
  ...jest.requireActual<object>('../lib/clerk'),
  useSignInInfo: () => mockSignInInfo,
}));
jest.mock('@clerk/expo', () => ({
  ClerkProvider: ({ children }: { children: React.ReactNode }) => children,
  useUser: () => ({ user: mockClerkUser.email ? { primaryEmailAddress: { emailAddress: mockClerkUser.email } } : null }),
  useClerk: () => mockClerkInstance,
  useReverification: (fn: (...args: never[]) => unknown, options?: { onNeedsReverification?: (h: { cancel: () => void }) => void }) => (...args: never[]) => mockReverify(fn, options, args),
  useSignIn: () => ({ signIn: mockSignIn }),
  useSignUp: () => ({ signUp: mockSignUp }),
  useSSO: () => ({ startSSOFlow: jest.fn() }),
}));
jest.mock('expo-auth-session', () => ({ makeRedirectUri: () => 'grieversguidance://sso-callback' }));

const profileWith = (senderName: string | null, more: ProfileUpdate = {}): ProfileResult => ({
  ok: true,
  profile: { id: 'u1', senderName, contactSource: null, firstName: null, lastName: null, fullName: null, birthDate: null, address: null, accountType: 'owner', createdAt: 'x', updatedAt: 'x', ...more },
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
  mockSignInInfo = { email: null, manageUrl: null, deleteAccount: null };
  mockClerkInstance.loaded = true;
  mockClerkInstance.buildUserProfileUrl = () => 'https://accounts.example.com/user';
  mockClerkUser.email = null;
  mockReverify = async (fn, _options, args) => fn(...args);
  jest.restoreAllMocks();
  await AsyncStorage.clear();
  mockGetProfile.mockReset().mockResolvedValue(noProfile);
  mockUpdateProfile.mockReset().mockImplementation(async (_t, u) => profileWith(u.senderName ?? u.firstName ?? '', u));
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

  it('does not ask for a name when the account has none', async () => {
    mockGetProfile.mockResolvedValue(profileWith(null));
    renderAccount();
    await screen.findByLabelText('Email');
    press('Sign in');
    await screen.findByLabelText('First name, required');
    expect(screen.getByRole('heading', { name: 'Your account' })).toBeTruthy();
    expect(screen.queryByText('What should we call you?')).toBeNull();
    expect(screen.queryByText('This is the name on your account.')).toBeNull();
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
    await screen.findByLabelText('First name, required');
    expect(screen.queryByText('What should we call you?')).toBeNull();
    expect(mockUpdateProfile).not.toHaveBeenCalled();
    expect(value('First name, required')).toBe('');
  });

  it('saves a newer name after an offline sign-up, and the old sign-up name does not overwrite it', async () => {
    mockUpdateProfile.mockResolvedValueOnce({ ok: false, reason: 'offline' });
    await openSignUp();
    await createAccount();
    await screen.findByText(OFFLINE);
    type('First name, required', 'Samantha');
    press('Save');
    await screen.findByText('Your details are saved.');
    expect(mockUpdateProfile.mock.calls.map((c) => c[1])).toEqual([{ senderName: 'Sam' }, { firstName: 'Samantha', lastName: null, birthDate: null, address: null }]);
  });

  it('does not ask for a name when the profile still has none after sign-up', async () => {
    mockUpdateProfile.mockResolvedValue(profileWith(''));
    await openSignUp();
    await createAccount();
    await screen.findByLabelText('First name, required');
    expect(screen.queryByText('What should we call you?')).toBeNull();
  });

  it('keeps the typed name in the field when saving it fails', async () => {
    mockUpdateProfile.mockResolvedValue({ ok: false, reason: 'offline' });
    await openSignUp();
    await createAccount();
    await screen.findByText(OFFLINE);
    expect(value('First name, required')).toBe('Sam');
    expect(screen.getByRole('heading', { name: 'Your account' })).toBeTruthy();
  });
});

describe('Account as the first screen', () => {
  function renderFirst(onSignedIn: () => void, initial = true) {
    return render(
      <Harness initial={initial}>
        <AccountScreen onBack={() => undefined} onSignedIn={onSignedIn} />
      </Harness>,
    );
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('leaves once signed in and the profile has loaded, with a name', async () => {
    const onSignedIn = jest.fn();
    mockGetProfile.mockResolvedValue(profileWith('Sam'));
    renderFirst(onSignedIn);
    await waitFor(() => expect(onSignedIn).toHaveBeenCalledTimes(1));
  });

  it('leaves once signed in and the profile has loaded, with no name, and never shows the name prompt', async () => {
    const onSignedIn = jest.fn();
    mockGetProfile.mockResolvedValue(profileWith(null));
    renderFirst(onSignedIn);
    await waitFor(() => expect(onSignedIn).toHaveBeenCalledTimes(1));
    expect(screen.queryByText('What should we call you?')).toBeNull();
  });

  it('leaves when the account has no profile row yet', async () => {
    const onSignedIn = jest.fn();
    mockGetProfile.mockResolvedValue(noProfile);
    renderFirst(onSignedIn);
    await waitFor(() => expect(onSignedIn).toHaveBeenCalledTimes(1));
  });

  it('while the profile is loading: no name prompt and does not leave, then leaves when it loads', async () => {
    const onSignedIn = jest.fn();
    let resolveProfile: (r: ProfileResult) => void = () => undefined;
    mockGetProfile.mockReturnValue(new Promise<ProfileResult>((resolve) => (resolveProfile = resolve)));
    renderFirst(onSignedIn);
    await screen.findByLabelText('First name, required');
    expect(screen.queryByText('What should we call you?')).toBeNull();
    expect(onSignedIn).not.toHaveBeenCalled();
    await act(async () => resolveProfile(profileWith(null)));
    await waitFor(() => expect(onSignedIn).toHaveBeenCalledTimes(1));
    expect(screen.queryByText('What should we call you?')).toBeNull();
  });

  it('after sign-up with a name on the first screen, saves the name and leaves once', async () => {
    const onSignedIn = jest.fn();
    render(
      <Harness>
        <AccountScreen onBack={() => undefined} onSignedIn={onSignedIn} />
      </Harness>,
    );
    fireEvent.press(await screen.findByRole('button', { name: 'Create an account' }));
    await screen.findByLabelText('Your name');
    type('Your name', 'Sam');
    type('Email', 'sam@x.co');
    type('Password', 'a-long-password');
    press('Create account');
    await screen.findByLabelText('6-digit code');
    type('6-digit code', '123456');
    await act(async () => press('Create account'));
    await waitFor(() => expect(onSignedIn).toHaveBeenCalledTimes(1));
    expect(mockUpdateProfile).toHaveBeenCalledWith('t', { senderName: 'Sam' });
    expect(screen.queryByText('What should we call you?')).toBeNull();
  });

  it('leaves when the profile call fails (offline)', async () => {
    const onSignedIn = jest.fn();
    mockGetProfile.mockResolvedValue({ ok: false, reason: 'offline' });
    renderFirst(onSignedIn);
    await waitFor(() => expect(onSignedIn).toHaveBeenCalledTimes(1));
  });

  it('does not leave while signed out', async () => {
    const onSignedIn = jest.fn();
    renderFirst(onSignedIn, false);
    await screen.findByLabelText('Email');
    expect(onSignedIn).not.toHaveBeenCalled();
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
    await screen.findByText('Your details are saved.');
    expect(mockUpdateProfile).toHaveBeenCalledWith('t', { firstName: 'Samantha', lastName: null, birthDate: null, address: null });
    // Only the shared status line announces it, once.
    expect(announce.mock.calls.filter(([m]) => m === 'Your details are saved.')).toHaveLength(1);
  });

  it('shows "Your details are saved." on the first save, when the account had no profile yet', async () => {
    mockGetProfile.mockResolvedValue(noProfile);
    renderAccount(true);
    await screen.findByLabelText('First name, required');
    type('First name, required', 'Sam');
    press('Save');
    await screen.findByText('Your details are saved.');
    expect(value('First name, required')).toBe('Sam');
  });

  it('shows the error and keeps the typed name when saving fails', async () => {
    mockUpdateProfile.mockResolvedValue({ ok: false, reason: 'offline' });
    renderAccount(true);
    fireEvent.changeText(await screen.findByDisplayValue('Sam'), 'Samantha');
    press('Save');
    await screen.findByText(OFFLINE);
    expect(value('First name, required')).toBe('Samantha');
  });

  it('does not save a name of only spaces', async () => {
    renderAccount(true);
    fireEvent.changeText(await screen.findByDisplayValue('Sam'), '   ');
    press('Save');
    await screen.findByText('Please enter your first name.');
    expect(mockUpdateProfile).not.toHaveBeenCalled();
  });

  it('uses the offline copy when the profile cannot be fetched', async () => {
    mockGetProfile.mockResolvedValue({ ok: false, reason: 'offline' });
    renderAccount(true);
    await screen.findByText('You are offline. You can change your name when you are connected.');
  });

  it('saves a new name and shows no offline line when online (#343)', async () => {
    mockGetProfile.mockResolvedValue(profileWith('Sam'));
    renderAccount(true);
    await screen.findByDisplayValue('Sam');
    expect(screen.queryByText(/You are offline/)).toBeNull();
    type('First name, required', 'Samantha');
    press('Save');
    await screen.findByText('Your details are saved.');
    expect(mockUpdateProfile).toHaveBeenCalledWith('t', { firstName: 'Samantha', lastName: null, birthDate: null, address: null });
    expect(screen.queryByText(/You are offline/)).toBeNull();
  });

  it('draws Sign out as an outline with no fill, unlike Save (#343)', async () => {
    mockGetProfile.mockResolvedValue(profileWith('Sam'));
    renderAccount(true);
    await screen.findByDisplayValue('Sam');
    const fill = (name: string) => StyleSheet.flatten(screen.getByRole('button', { name }).props.style).backgroundColor;
    expect(fill('Sign out')).toBeUndefined();
    expect(fill('Save')).toBeTruthy();
  });

  it('keeps the view, the note and the typed name when the session ends', async () => {
    renderAccount(true);
    fireEvent.changeText(await screen.findByDisplayValue('Sam'), 'Samantha');
    act(() => mockAuthControl.setSignedIn(false));
    await screen.findByText("You've been signed out. Your work on this device is safe. Sign in again when you're ready.");
    expect(value('First name, required')).toBe('Samantha');
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

  describe("What you'll need is not on Your account (#716)", () => {
    const expectNoChecklist = () => {
      expect(screen.queryByText("What you'll need")).toBeNull();
      expect(screen.queryByRole('header', { name: "What you'll need" })).toBeNull();
      expect(screen.queryByRole('button', { name: "What you'll need" })).toBeNull();
      expect(screen.queryByRole('checkbox')).toBeNull();
    };

    it('shows no list, note or button when the account has a name', async () => {
      mockGetProfile.mockResolvedValue(profileWith('Server Name'));
      renderAccount(true);
      await screen.findByDisplayValue('Server Name');
      expectNoChecklist();
    });

    it('shows no list, note or button when the account has no name', async () => {
      mockGetProfile.mockResolvedValue(profileWith(null));
      renderAccount(true);
      await screen.findByRole('heading', { name: 'Your account' });
      await screen.findByLabelText('First name, required');
      expectNoChecklist();
    });

    it('still saves the name and signs out', async () => {
      mockGetProfile.mockResolvedValue(profileWith(null));
      mockUpdateProfile.mockResolvedValue(profileWith('Ann'));
      renderAccount(true);
      const field = await screen.findByLabelText('First name, required');
      fireEvent.changeText(field, 'Ann');
      press('Save');
      await waitFor(() => expect(mockUpdateProfile).toHaveBeenCalledWith('t', { firstName: 'Ann', lastName: null, birthDate: null, address: null }));
      press('Sign out');
      await screen.findByLabelText('Email');
    });

    it('leaves the saved Gather ticks on the device', async () => {
      await AsyncStorage.setItem(CHECKLIST_KEY, '["insurance"]');
      renderAccount(true);
      await screen.findByLabelText('First name, required');
      expect(await AsyncStorage.getItem(CHECKLIST_KEY)).toBe('["insurance"]');
    });
  });
});

describe('personal details (#717)', () => {
  const FIRST = 'First name, required';
  const LAST = 'Last name (optional)';
  const saveButton = () => press('Save');
  const full = profileWith('Anna', {
    firstName: 'Anna',
    lastName: 'Lee',
    birthDate: '1980-05-29',
    address: { line1: '1 Main St', line2: 'Apt 2', city: 'Newark', state: 'NJ', zip: '07101' },
  });
  const noAddress = { firstName: 'Anna', lastName: null, birthDate: null, address: null };

  it('fills every field from the profile, with the date as the picker text', async () => {
    mockGetProfile.mockResolvedValue(full);
    renderAccount(true);
    await screen.findByDisplayValue('Anna');
    expect(value(FIRST)).toBe('Anna');
    expect(value(LAST)).toBe('Lee');
    expect(value('Address line 1')).toBe('1 Main St');
    expect(value('Address line 2 (optional)')).toBe('Apt 2');
    expect(value('City')).toBe('Newark');
    expect(value('State')).toBe('NJ');
    expect(value('ZIP code')).toBe('07101');
    expect(screen.getByRole('button', { name: 'Date of birth, optional' }).props.accessibilityValue).toEqual({ text: 'May 29, 1980' });
  });

  it('falls back to the sender name only when no first or last name is saved', async () => {
    mockGetProfile.mockResolvedValue(profileWith('Sam'));
    renderAccount(true);
    await screen.findByDisplayValue('Sam');
    screen.unmount();
    mockGetProfile.mockResolvedValue(profileWith('Sam', { lastName: 'Lee' }));
    renderAccount(true);
    await screen.findByDisplayValue('Lee');
    expect(value(FIRST)).toBe('');
  });

  it('never overwrites typing with a late load', async () => {
    let resolveProfile: (r: ProfileResult) => void = () => undefined;
    mockGetProfile.mockReturnValue(new Promise<ProfileResult>((resolve) => (resolveProfile = resolve)));
    renderAccount(true);
    await screen.findByLabelText(FIRST);
    type(FIRST, 'Typed');
    await act(async () => resolveProfile(full));
    await screen.findByDisplayValue('Lee');
    expect(value(FIRST)).toBe('Typed');
  });

  it('saves the typed values through updateDetails', async () => {
    mockGetProfile.mockResolvedValue(full);
    renderAccount(true);
    await screen.findByDisplayValue('Anna');
    type(FIRST, ' Annie ');
    type(LAST, '');
    type('Address line 2 (optional)', '');
    type('State', 'new jersey');
    saveButton();
    await screen.findByText('Your details are saved.');
    expect(mockUpdateProfile).toHaveBeenCalledWith('t', {
      firstName: 'Annie',
      lastName: null,
      birthDate: '1980-05-29',
      address: { line1: '1 Main St', line2: '', city: 'Newark', state: 'NJ', zip: '07101' },
    });
  });

  it('saves a profile with no address and no date as nulls', async () => {
    mockGetProfile.mockResolvedValue(profileWith('Anna', { firstName: 'Anna' }));
    renderAccount(true);
    await screen.findByDisplayValue('Anna');
    saveButton();
    await screen.findByText('Your details are saved.');
    expect(mockUpdateProfile).toHaveBeenCalledWith('t', noAddress);
  });

  it('refuses an empty first name and saves nothing', async () => {
    mockGetProfile.mockResolvedValue(full);
    renderAccount(true);
    await screen.findByDisplayValue('Anna');
    type(FIRST, '   ');
    saveButton();
    await screen.findByText('Please enter your first name.');
    expect(screen.getByText('Please check the fields with a message under them.')).toBeTruthy();
    expect(mockUpdateProfile).not.toHaveBeenCalled();
  });

  it('refuses a partial address with the message for each missing line', async () => {
    mockGetProfile.mockResolvedValue(profileWith('Anna', { firstName: 'Anna' }));
    renderAccount(true);
    await screen.findByDisplayValue('Anna');
    type('City', 'Newark');
    saveButton();
    await screen.findByText('Please enter the street address.');
    expect(screen.getByText('Please enter the state.')).toBeTruthy();
    expect(screen.getByText('Please enter the ZIP code.')).toBeTruthy();
    expect(mockUpdateProfile).not.toHaveBeenCalled();
  });

  it('refuses a state or ZIP that is not valid', async () => {
    mockGetProfile.mockResolvedValue(profileWith('Anna', { firstName: 'Anna' }));
    renderAccount(true);
    await screen.findByDisplayValue('Anna');
    type('Address line 1', '1 Main St');
    type('City', 'Newark');
    type('State', 'Narnia');
    type('ZIP code', '12');
    saveButton();
    await screen.findByText('Please use the two-letter state code, for example NJ.');
    expect(screen.getByText('Please enter a ZIP code like 07001 or 07001-1234.')).toBeTruthy();
    expect(mockUpdateProfile).not.toHaveBeenCalled();
  });

  it('refuses a birth date out of range', async () => {
    mockGetProfile.mockResolvedValue(profileWith('Anna', { firstName: 'Anna', birthDate: '2999-01-01' }));
    renderAccount(true);
    await screen.findByDisplayValue('Anna');
    saveButton();
    await screen.findByText("Please check the date. It can't be in the future or before 1900.");
    expect(mockUpdateProfile).not.toHaveBeenCalled();
  });

  it('clears a field message when the person fixes that field', async () => {
    mockGetProfile.mockResolvedValue(full);
    renderAccount(true);
    await screen.findByDisplayValue('Anna');
    type(FIRST, '');
    saveButton();
    await screen.findByText('Please enter your first name.');
    type(FIRST, 'Anna');
    expect(screen.queryByText('Please enter your first name.')).toBeNull();
  });

  it('shows the server refusal message and keeps what was typed', async () => {
    mockGetProfile.mockResolvedValue(full);
    mockUpdateProfile.mockResolvedValue({ ok: false, reason: 'invalid' });
    renderAccount(true);
    await screen.findByDisplayValue('Anna');
    type(FIRST, 'Annie');
    saveButton();
    await screen.findByText("We couldn't save that. Please check your details and try again.");
    expect(value(FIRST)).toBe('Annie');
  });

  it('does nothing when Save is pressed before the profile has loaded', async () => {
    mockGetProfile.mockReturnValue(new Promise<ProfileResult>(() => undefined));
    renderAccount(true);
    await screen.findByLabelText(FIRST);
    type(FIRST, 'Typed');
    saveButton();
    await screen.findByText('Loading your details.');
    expect(mockUpdateProfile).not.toHaveBeenCalled();
  });

  it('puts the date of birth under its label with the hint', async () => {
    mockGetProfile.mockResolvedValue(full);
    renderAccount(true);
    await screen.findByDisplayValue('Anna');
    expect(screen.getByText('Date of birth', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.getByText('Optional. Only you can see this.')).toBeTruthy();
    expect(screen.getByText('Address')).toBeTruthy();
  });

  it('first load fails with nothing kept: shows the offline line and Try again, blocks Save, and a retry unblocks it', async () => {
    mockGetProfile.mockResolvedValue({ ok: false, reason: 'offline' });
    renderAccount(true);
    await screen.findByText('You are offline. You can change your name when you are connected.');
    expect(screen.queryByText('Loading your details.')).toBeNull();
    type(FIRST, 'Annie');
    saveButton();
    expect(mockUpdateProfile).not.toHaveBeenCalled();
    mockGetProfile.mockResolvedValue(full);
    press('Try again');
    await screen.findByDisplayValue('Lee');
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
    saveButton();
    await screen.findByText('Your details are saved.');
    expect(mockUpdateProfile).toHaveBeenCalledWith('t', {
      firstName: 'Annie',
      lastName: 'Lee',
      birthDate: '1980-05-29',
      address: { line1: '1 Main St', line2: 'Apt 2', city: 'Newark', state: 'NJ', zip: '07101' },
    });
  });

  it('first load fails and the server is unreachable (not offline): says so, never Loading', async () => {
    mockGetProfile.mockResolvedValue({ ok: false, reason: 'failed' } as ProfileResult);
    renderAccount(true);
    await screen.findByText("Accounts aren't available right now.");
    expect(screen.queryByText('Loading your details.')).toBeNull();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
  });

  it('first load fails but a profile is kept on the device: Save works with the kept values', async () => {
    await AsyncStorage.setItem('gg.signedIn.v1', 'u1');
    await AsyncStorage.setItem(
      'gg.profile.v1',
      JSON.stringify({ id: 'u1', senderName: 'Kept', firstName: 'Kept', lastName: 'Name', birthDate: '1980-05-29', address: null, contactSource: null, accountType: 'owner' }),
    );
    mockGetProfile.mockResolvedValue({ ok: false, reason: 'offline' });
    renderAccount(true);
    await screen.findByDisplayValue('Kept');
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
    saveButton();
    await screen.findByText('Your details are saved.');
    expect(mockUpdateProfile).toHaveBeenCalledWith('t', { firstName: 'Kept', lastName: 'Name', birthDate: '1980-05-29', address: null });
  });

  it('a profile kept on the device while the first load is pending: shows Loading and blocks Save', async () => {
    await AsyncStorage.setItem('gg.signedIn.v1', 'u1');
    await AsyncStorage.setItem(
      'gg.profile.v1',
      JSON.stringify({ id: 'u1', senderName: 'Kept', firstName: 'Kept', lastName: null, birthDate: null, address: null, contactSource: null, accountType: 'owner' }),
    );
    mockGetProfile.mockReturnValue(new Promise<ProfileResult>(() => undefined));
    renderAccount(true);
    await screen.findByDisplayValue('Kept');
    await screen.findByText('Loading your details.');
    saveButton();
    expect(mockUpdateProfile).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
  });

  it('first load says there is no profile: Save works', async () => {
    mockGetProfile.mockResolvedValue(noProfile);
    renderAccount(true);
    await screen.findByLabelText(FIRST);
    type(FIRST, 'Annie');
    saveButton();
    await screen.findByText('Your details are saved.');
  });

  it('after a failed save, moves focus to the first wrong field', async () => {
    const focus = jest.spyOn(AccessibilityInfo, 'setAccessibilityFocus');
    mockGetProfile.mockResolvedValue(full);
    renderAccount(true);
    await screen.findByDisplayValue('Anna');
    type('ZIP code', '1');
    type(FIRST, '');
    focus.mockClear();
    saveButton();
    await screen.findByText('Please enter your first name.');
    await waitFor(() => expect(focus).toHaveBeenCalledTimes(1));
    expect(screen.getByLabelText(FIRST).props.accessibilityHint).toBe('Please enter your first name.');
  });
});

describe('sign-up name save with a slow first load (#717)', () => {
  it('lets a details Save succeed afterwards', async () => {
    mockGetProfile.mockReturnValue(new Promise<ProfileResult>(() => undefined));
    renderAccount();
    fireEvent.press(await screen.findByRole('button', { name: 'Create an account' }));
    await screen.findByLabelText('Your name');
    type('Your name', 'Sam');
    type('Email', 'sam@x.co');
    type('Password', 'a-long-password');
    press('Create account');
    await screen.findByLabelText('6-digit code');
    type('6-digit code', '123456');
    await act(async () => press('Create account'));
    await screen.findByDisplayValue('Sam');
    type('First name, required', 'Samantha');
    press('Save');
    await screen.findByText('Your details are saved.');
    expect(mockUpdateProfile.mock.calls.map((c) => c[1])).toEqual([{ senderName: 'Sam' }, { firstName: 'Samantha', lastName: null, birthDate: null, address: null }]);
  });
});

describe('sign-in details and support (#718)', () => {
  const headingNames = () => screen.getAllByRole('heading').map((node) => node.props.children);

  it('shows the email and the groups in order: Profile, Sign-in and security, Sign out, Help and support', async () => {
    mockSignInInfo = { email: 'sam@example.com', manageUrl: 'https://accounts.example.com/user', deleteAccount: null };
    mockGetProfile.mockResolvedValue(profileWith('Sam'));
    renderAccount(true);
    await screen.findByDisplayValue('Sam');
    expect(screen.getByText('sam@example.com')).toBeTruthy();
    expect(headingNames()).toEqual(['Your account', 'Profile', 'Address', 'Sign-in and security', 'Sign out', 'Help and support']);
  });

  it('hides the sign-in group while the email has not loaded', async () => {
    mockGetProfile.mockResolvedValue(profileWith('Sam'));
    renderAccount(true);
    await screen.findByDisplayValue('Sam');
    expect(screen.queryByText('Sign-in and security')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Manage sign-in' })).toBeNull();
  });

  it('opens the hosted Clerk account page in the browser from Manage sign-in', async () => {
    mockSignInInfo = { email: 'sam@example.com', manageUrl: 'https://accounts.example.com/user', deleteAccount: null };
    mockGetProfile.mockResolvedValue(profileWith('Sam'));
    renderAccount(true);
    await screen.findByDisplayValue('Sam');
    press('Manage sign-in');
    await waitFor(() => expect(WebBrowser.openBrowserAsync).toHaveBeenCalledWith('https://accounts.example.com/user'));
  });

  it('shows a calm line when the browser does not open', async () => {
    mockSignInInfo = { email: 'sam@example.com', manageUrl: 'https://accounts.example.com/user', deleteAccount: null };
    (WebBrowser.openBrowserAsync as jest.Mock<() => Promise<unknown>>).mockRejectedValueOnce(new Error('no browser'));
    mockGetProfile.mockResolvedValue(profileWith('Sam'));
    renderAccount(true);
    await screen.findByDisplayValue('Sam');
    expect(screen.queryByText(/could not open your account page/)).toBeNull();
    press('Manage sign-in');
    await screen.findByText(/could not open your account page/);
  });

  it('shows no Manage sign-in button when there is no address', async () => {
    mockSignInInfo = { email: 'sam@example.com', manageUrl: null, deleteAccount: null };
    mockGetProfile.mockResolvedValue(profileWith('Sam'));
    renderAccount(true);
    await screen.findByDisplayValue('Sam');
    expect(screen.queryByRole('button', { name: 'Manage sign-in' })).toBeNull();
    expect(screen.getByText('sam@example.com')).toBeTruthy();
  });

  it('opens the mail app with the subject encoded', async () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    mockGetProfile.mockResolvedValue(profileWith('Sam'));
    renderAccount(true);
    await screen.findByDisplayValue('Sam');
    press('Email support');
    await waitFor(() => expect(open).toHaveBeenCalledWith('mailto:grieversguidancetech@gmail.com?subject=Help%20with%20Grievers%20Guidance'));
    expect(screen.queryByText(/could not open your email app/)).toBeNull();
  });

  it('says the address can be copied when the mail app does not open', async () => {
    jest.spyOn(Linking, 'openURL').mockRejectedValue(new Error('no mail app'));
    mockGetProfile.mockResolvedValue(profileWith('Sam'));
    renderAccount(true);
    await screen.findByDisplayValue('Sam');
    press('Email support');
    await screen.findByText(/could not open your email app. You can copy the address above/);
    expect(screen.getByText('grieversguidancetech@gmail.com')).toBeTruthy();
  });
});

describe('the Clerk bridge (#718)', () => {
  const { useSignInInfo: actualUseSignInInfo } = jest.requireActual<typeof import('../lib/clerk')>('../lib/clerk');
  function ActualProbe() {
    const info = actualUseSignInInfo();
    return <Text>{`${info.email ?? 'no email'}|${info.manageUrl ?? 'no url'}|${info.deleteAccount ? 'can delete' : 'no delete'}`}</Text>;
  }

  it('reads the signed-in email and the https account page from Clerk', () => {
    mockClerkUser.email = 'sam@example.com';
    render(<ClerkBoundary publishableKey="pk_test"><ActualProbe /></ClerkBoundary>);
    expect(screen.getByText('sam@example.com|https://accounts.example.com/user|can delete')).toBeTruthy();
  });

  it('gives no address until Clerk has loaded, and none that is not https', () => {
    mockClerkUser.email = 'sam@example.com';
    mockClerkInstance.loaded = false;
    const { unmount } = render(<ClerkBoundary publishableKey="pk_test"><ActualProbe /></ClerkBoundary>);
    expect(screen.getByText('sam@example.com|no url|no delete')).toBeTruthy();
    unmount();
    mockClerkInstance.loaded = true;
    mockClerkInstance.buildUserProfileUrl = () => '/user';
    render(<ClerkBoundary publishableKey="pk_test"><ActualProbe /></ClerkBoundary>);
    expect(screen.getByText('sam@example.com|no url|can delete')).toBeTruthy();
  });

  it('shows nothing when nobody is signed in', () => {
    mockClerkUser.email = null;
    render(<ClerkBoundary publishableKey="pk_test"><ActualProbe /></ClerkBoundary>);
    expect(screen.getByText('no email|no url|no delete')).toBeTruthy();
  });
});


describe('Delete account (#719)', () => {
  const copy = screenCopy('account');
  const phone = screenCopy('phoneAccount');
  const seedLocalData = () =>
    AsyncStorage.multiSet([
      ['gg.sessions.v1', '[{"id":"anna","obituaryEmailedAt":"2026-01-01"}]'],
      ['gg.contacts.v1', '[]'],
      ['gg.publisherEmail.v1.anna', 'obits@paper.example'],
    ]);
  async function openConfirm() {
    mockGetProfile.mockResolvedValue(profileWith('Sam'));
    renderAccount(true);
    await screen.findByDisplayValue('Sam');
    press(copy.deleteOpen);
  }

  it('is not offered until Clerk has a user to delete', async () => {
    mockGetProfile.mockResolvedValue(profileWith('Sam'));
    renderAccount(true);
    await screen.findByDisplayValue('Sam');
    expect(screen.queryByRole('button', { name: copy.deleteOpen })).toBeNull();
  });

  it('after a delete: clears this phone, then tells the app the account is gone and whether it was fully cleared', async () => {
    await seedLocalData();
    const heard = jest.fn<(cleared: boolean) => void>();
    const stop = onAccountDeleted(heard);
    const remove = jest.fn(async () => {
      act(() => mockAuthControl.setSignedIn(false));
    });
    mockSignInInfo.deleteAccount = remove;
    await openConfirm();
    press(copy.deleteConfirmAction);
    await waitFor(() => expect(heard).toHaveBeenCalledWith(true));
    stop();
    expect(remove).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(copy.sessionEnded)).toBeNull();
    expect(await AsyncStorage.getAllKeys()).toEqual([]);
  });

  it('tells the app some things were left on the phone when a local item cannot be removed', async () => {
    await seedLocalData();
    const real = AsyncStorage.removeItem.bind(AsyncStorage);
    jest.spyOn(AsyncStorage, 'removeItem').mockImplementation(async (key: string) => {
      if (key === 'gg.publisherEmail.v1.anna') {
        throw new Error('disk');
      }
      return real(key);
    });
    const heard = jest.fn<(cleared: boolean) => void>();
    const stop = onAccountDeleted(heard);
    mockSignInInfo.deleteAccount = jest.fn(async () => undefined);
    await openConfirm();
    press(copy.deleteConfirmAction);
    await waitFor(() => expect(heard).toHaveBeenCalledWith(false));
    stop();
  });

  it('a closed verify step says the account was not deleted and keeps everything on the phone', async () => {
    await seedLocalData();
    const heard = jest.fn();
    const stop = onAccountDeleted(heard);
    mockSignInInfo.deleteAccount = jest.fn(async () => {
      throw new DeleteCancelledError();
    });
    await openConfirm();
    press(copy.deleteConfirmAction);
    await screen.findByText(copy.deleteCancelled);
    stop();
    expect(heard).not.toHaveBeenCalled();
    expect(await AsyncStorage.getAllKeys()).toEqual(expect.arrayContaining(['gg.sessions.v1', 'gg.contacts.v1', 'gg.publisherEmail.v1.anna']));
  });

  it('a delete that needs a fresh sign-in says to sign out, sign back in and try again, and keeps everything', async () => {
    await seedLocalData();
    mockSignInInfo.deleteAccount = jest.fn(async () => {
      throw new DeleteNeedsSignInError();
    });
    await openConfirm();
    press(copy.deleteConfirmAction);
    await screen.findByText(phone.deleteNeedsSignIn);
    expect(await AsyncStorage.getAllKeys()).toEqual(expect.arrayContaining(['gg.sessions.v1', 'gg.publisherEmail.v1.anna']));
  });

  it('any other failure says so calmly, keeps everything, and stays signed in', async () => {
    await seedLocalData();
    mockSignInInfo.deleteAccount = jest.fn(async () => {
      throw new Error('offline');
    });
    await openConfirm();
    press(copy.deleteConfirmAction);
    await screen.findByText(copy.deleteFailed);
    expect(screen.queryByText(copy.sessionEnded)).toBeNull();
    expect(screen.getByDisplayValue('Sam')).toBeTruthy();
    expect(await AsyncStorage.getAllKeys()).toEqual(expect.arrayContaining(['gg.sessions.v1', 'gg.publisherEmail.v1.anna']));
  });
});

describe('the Clerk bridge: delete account on the phone (#719)', () => {
  const { useSignInInfo: actualUseSignInInfo } = jest.requireActual<typeof import('../lib/clerk')>('../lib/clerk');
  let outcome = 'not run';
  function DeleteProbe() {
    const info = actualUseSignInInfo();
    return <Text onPress={() => void info.deleteAccount?.().then(() => (outcome = 'deleted'), (e: unknown) => (outcome = (e as Error).name))}>delete</Text>;
  }
  const mockUser = () => {
    mockClerkUser.email = 'sam@example.com';
  };

  it('Clerk asks for a verify step: the step is cancelled, and the error says to sign in again', async () => {
    mockUser();
    mockReverify = (_fn, options) =>
      new Promise((_resolve, reject) => {
        options?.onNeedsReverification?.({ cancel: () => reject(Object.assign(new Error('User cancelled attempted verification'), { code: 'reverification_cancelled' })) });
      });
    render(<ClerkBoundary publishableKey="pk_test"><DeleteProbe /></ClerkBoundary>);
    fireEvent.press(screen.getByText('delete'));
    await waitFor(() => expect(outcome).toBe('DeleteNeedsSignInError'));
  });

  it('a cancel that did not come from the bridge stays a plain cancel', async () => {
    mockUser();
    mockReverify = async () => {
      throw Object.assign(new Error('closed'), { code: 'reverification_cancelled' });
    };
    render(<ClerkBoundary publishableKey="pk_test"><DeleteProbe /></ClerkBoundary>);
    fireEvent.press(screen.getByText('delete'));
    await waitFor(() => expect(outcome).toBe('DeleteCancelledError'));
  });
});

describe('the launch state after a delete (#719)', () => {
  function LaunchProbe() {
    const launch = useLaunchState();
    return <Text>{launch?.hydrated ? (launch.signedIn ? 'signed-in marker' : 'no marker') : 'reading'}</Text>;
  }
  it('reads the signed-in marker again, so the next first screen is the signed-out one', async () => {
    await AsyncStorage.setItem(SIGNED_IN_STORAGE_KEY, 'u1');
    await AsyncStorage.setItem('gg.profile.v1', JSON.stringify({ id: 'u1', senderName: 'Sam' }));
    render(
      <Harness initial>
        <LaunchProbe />
      </Harness>,
    );
    await screen.findByText('signed-in marker');
    const { announceAccountDeleted } = jest.requireActual<typeof import('../lib/deleteLocalData')>('../lib/deleteLocalData');
    act(() => announceAccountDeleted(true));
    await screen.findByText('no marker');
  });
});
