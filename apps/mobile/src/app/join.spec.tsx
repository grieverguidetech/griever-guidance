import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Linking } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { UseAccountResult } from '@griever/hooks';
import { START_FIRST } from '../screens/HomeScreen';

// Accounts and sharing are both on, as in App.signInFirst.spec.tsx: set before App is first required.
process.env.EXPO_PUBLIC_FEATURE_AUTH = 'true';
process.env.EXPO_PUBLIC_FEATURE_SHARING = 'true';
process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY = 'pk_test_example';

let mockAccount: UseAccountResult | null = null;
let mockLaunch: { hydrated: boolean; signedIn: boolean } | null = { hydrated: true, signedIn: false };
const mockSetAccount: { current: (a: UseAccountResult | null) => void } = { current: () => undefined };
jest.mock('../lib/AccountProvider', () => {
  const React = require('react') as typeof import('react');
  const Ctx = React.createContext<UseAccountResult | null>(null);
  return {
    useAccount: () => React.useContext(Ctx),
    useLaunchState: () => mockLaunch,
    useSyncAuth: () => ({ status: 'signed_in', userId: 'u1', getToken: async () => 'access-token' }),
    AccountProvider: ({ children }: { children: React.ReactNode }) => {
      const [value, setValue] = React.useState(mockAccount);
      mockSetAccount.current = (a) => {
        mockAccount = a;
        setValue(a);
      };
      return React.createElement(Ctx.Provider, { value }, children);
    },
  };
});
jest.mock('@clerk/expo', () => ({
  useSignIn: () => ({ signIn: { status: 'needs_first_factor' } }),
  useSignUp: () => ({ signUp: { status: 'missing_requirements' } }),
  useSSO: () => ({ startSSOFlow: jest.fn() }),
}));
jest.mock('expo-auth-session', () => ({ makeRedirectUri: () => 'grieversguidance://sso-callback' }));

const mockAccept = jest.fn<(access: string, invite: string) => Promise<unknown>>();
const mockGetProfile = jest.fn<(access: string) => Promise<unknown>>();
jest.mock('@griever/api-client', () => ({
  ...jest.requireActual<object>('@griever/api-client'),
  acceptInvite: (access: string, invite: string) => mockAccept(access, invite),
  getProfile: (access: string) => mockGetProfile(access),
}));

const { App } = require('./App') as typeof import('./App');

const TOKEN = 'Zq3_' + 'k'.repeat(39);
const LINK = `https://web.grieversguidance.com/join#t=${TOKEN}`;
const MEMBER_EMPTY = "When someone adds you to help, the people you're helping will show here.";

const account = (over: Partial<UseAccountResult>): UseAccountResult => ({
  status: 'signed_out',
  isSignedIn: false,
  isLoading: false,
  offline: false,
  profile: null,
  profileAnswered: false,
  profileLoaded: false,
  error: null,
  clearError: () => undefined,
  signOut: async () => undefined,
  updateDetails: async () => ({ ok: false, invalid: false }),
  updateSenderName: async () => true,
  ...over,
});
const owner = { id: 'u1', senderName: 'Sam', contactSource: null, accountType: 'owner' as const };
const member = { ...owner, accountType: 'member' as const };
const reload = jest.fn();
const signedOut = account({});
const signedIn = account({ status: 'signed_in', isSignedIn: true, profile: owner, profileAnswered: true, profileLoaded: true, reloadProfile: reload });

const stored = async () => AsyncStorage.getItem('gg.join.v1');
const logged = jest.fn();

beforeEach(() => {
  jest.restoreAllMocks();
  mockAccount = signedOut;
  mockLaunch = { hydrated: true, signedIn: false };
  mockAccept.mockReset();
  mockGetProfile.mockReset();
  reload.mockReset();
  logged.mockReset();
  for (const method of ['log', 'info', 'warn', 'error'] as const) {
    jest.spyOn(console, method).mockImplementation(logged);
  }
  jest.spyOn(Linking, 'getInitialURL').mockResolvedValue(LINK);
  jest.spyOn(Linking, 'addEventListener').mockReturnValue({ remove: () => undefined } as never);
  mockGetProfile.mockResolvedValue({ ok: true, profile: owner });
});

function signInAs(next: UseAccountResult, launchSignedIn = true) {
  mockLaunch = { hydrated: true, signedIn: launchSignedIn };
  mockAccount = next;
}

describe('joining from an invitation link (#232)', () => {
  it('signed out: shows the invitation, keeps the token on the phone, and never shows it', async () => {
    render(<App />);
    expect(await screen.findByRole('heading', { name: "You've been asked to help" })).toBeTruthy();
    expect(screen.getByText('Create an account, or sign in, to help let people know.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Create an account' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'I already have an account' })).toBeTruthy();
    expect(screen.queryByText(new RegExp(TOKEN))).toBeNull();
    const saved = JSON.parse((await stored()) ?? 'null') as { token: string; savedAt: number };
    expect(saved.token).toBe(TOKEN);
    expect(mockAccept).not.toHaveBeenCalled();
  });

  it('signed out, then sign in: accepts once, then Home as a member with no create button', async () => {
    mockAccept.mockResolvedValue({ ok: true, ownerId: 'o1' });
    render(<App />);
    fireEvent.press(await screen.findByRole('button', { name: 'I already have an account' }));
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeTruthy();
    expect(mockAccept).not.toHaveBeenCalled();
    act(() => {
      mockLaunch = { hydrated: true, signedIn: true };
      mockSetAccount.current(signedIn);
    });
    await waitFor(() => expect(mockAccept).toHaveBeenCalledTimes(1));
    expect(mockAccept).toHaveBeenCalledWith('access-token', TOKEN);
    // The refresh asks for the profile again; the server now says member.
    await waitFor(() => expect(reload).toHaveBeenCalled());
    act(() => mockSetAccount.current(account({ ...signedIn, profile: member })));
    expect(await screen.findByText(MEMBER_EMPTY)).toBeTruthy();
    expect(screen.queryByText(START_FIRST)).toBeNull();
    expect(await stored()).toBeNull();
    expect(mockAccept).toHaveBeenCalledTimes(1);
  });

  it('already signed in: accepts at once, without showing the sign-in choice', async () => {
    signInAs(signedIn);
    mockAccept.mockResolvedValue({ ok: true, ownerId: 'o1' });
    render(<App />);
    await waitFor(() => expect(mockAccept).toHaveBeenCalledTimes(1));
    expect(mockAccept).toHaveBeenCalledWith('access-token', TOKEN);
    await waitFor(() => expect(reload).toHaveBeenCalled());
    expect(screen.queryByText("You've been asked to help")).toBeNull();
    expect(await stored()).toBeNull();
  });

  it('a refused invitation: one calm message, the token is dropped', async () => {
    signInAs(signedIn);
    mockAccept.mockResolvedValue({ ok: false, reason: 'unusable' });
    render(<App />);
    expect(await screen.findByRole('heading', { name: "This invitation can't be used" })).toBeTruthy();
    expect(screen.getByText('Ask the person who sent it for a new one.')).toBeTruthy();
    expect(await stored()).toBeNull();
    expect(mockAccept).toHaveBeenCalledTimes(1);
    expect(reload).not.toHaveBeenCalled();
    fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByText("Who you're writing about")).toBeTruthy();
  });

  it('a refusal for an account that is a member already says nothing and drops the token', async () => {
    signInAs(signedIn);
    mockAccept.mockResolvedValue({ ok: false, reason: 'unusable' });
    mockGetProfile.mockResolvedValue({ ok: true, profile: member });
    render(<App />);
    await waitFor(() => expect(reload).toHaveBeenCalled());
    expect(screen.queryByText("This invitation can't be used")).toBeNull();
    expect(await stored()).toBeNull();
  });

  it('an account with its own people: the conflict message, the token is dropped', async () => {
    signInAs(signedIn);
    mockAccept.mockResolvedValue({ ok: false, reason: 'conflict' });
    render(<App />);
    expect(await screen.findByRole('heading', { name: "This invitation can't be joined" })).toBeTruthy();
    expect(await stored()).toBeNull();
  });

  it('offline: the token is kept and the message says to open the app again', async () => {
    signInAs(signedIn);
    mockAccept.mockResolvedValue({ ok: false, reason: 'offline' });
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'You need a connection to join' })).toBeTruthy();
    expect(screen.getByText("Your link is saved. Open the app again when you're connected.")).toBeTruthy();
    expect(JSON.parse((await stored()) ?? 'null').token).toBe(TOKEN);
  });

  it('busy server: the token is kept', async () => {
    signInAs(signedIn);
    mockAccept.mockResolvedValue({ ok: false, reason: 'unavailable' });
    render(<App />);
    expect(await screen.findByRole('heading', { name: "Joining isn't available right now" })).toBeTruthy();
    expect(JSON.parse((await stored()) ?? 'null').token).toBe(TOKEN);
  });

  it('a link saved on an earlier launch is used when the app opens without a link', async () => {
    jest.spyOn(Linking, 'getInitialURL').mockResolvedValue(null);
    await AsyncStorage.setItem('gg.join.v1', JSON.stringify({ token: TOKEN, savedAt: Date.now() }));
    signInAs(signedIn);
    mockAccept.mockResolvedValue({ ok: true, ownerId: 'o1' });
    render(<App />);
    await waitFor(() => expect(mockAccept).toHaveBeenCalledWith('access-token', TOKEN));
  });

  it('a link that arrives while the app is open is picked up', async () => {
    jest.spyOn(Linking, 'getInitialURL').mockResolvedValue(null);
    // The navigation container listens for links too, so every listener is kept and all are called.
    const listeners: ((event: { url: string }) => void)[] = [];
    jest.spyOn(Linking, 'addEventListener').mockImplementation(((_type: string, fn: (event: { url: string }) => void) => {
      listeners.push(fn);
      return { remove: () => undefined };
    }) as never);
    signInAs(signedIn);
    mockAccept.mockResolvedValue({ ok: true, ownerId: 'o1' });
    render(<App />);
    expect(await screen.findByText("Who you're writing about")).toBeTruthy();
    await act(async () => listeners.forEach((fn) => fn({ url: LINK })));
    await waitFor(() => expect(mockAccept).toHaveBeenCalledWith('access-token', TOKEN));
  });

  it('a query-string link is ignored', async () => {
    jest.spyOn(Linking, 'getInitialURL').mockResolvedValue(`https://web.grieversguidance.com/join?t=${TOKEN}`);
    signInAs(signedIn);
    render(<App />);
    expect(await screen.findByText("Who you're writing about")).toBeTruthy();
    expect(mockAccept).not.toHaveBeenCalled();
    expect(await stored()).toBeNull();
  });

  it('never logs the token', async () => {
    signInAs(signedIn);
    mockAccept.mockResolvedValue({ ok: false, reason: 'unusable' });
    render(<App />);
    await screen.findByRole('heading', { name: "This invitation can't be used" });
    expect(JSON.stringify(logged.mock.calls)).not.toContain(TOKEN);
  });
});
