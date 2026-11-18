import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { AccessibilityInfo, BackHandler, Linking, Platform } from 'react-native';
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
const mockGetMembers = jest.fn<(access: string) => Promise<unknown>>();
jest.mock('@griever/api-client', () => ({
  ...jest.requireActual<object>('@griever/api-client'),
  acceptInvite: (access: string, invite: string) => mockAccept(access, invite),
  getProfile: (access: string) => mockGetProfile(access),
  getMembers: (access: string) => mockGetMembers(access),
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
  mockGetMembers.mockReset();
  mockGetMembers.mockResolvedValue({ ok: true, view: { role: 'member', owner: { id: 'o1', name: 'Anna' } } });
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

  it('"Create an account" opens sign-up and "I already have an account" opens sign-in', async () => {
    const { unmount } = render(<App />);
    // The app is under the Join screen but hidden from screen readers.
    expect(screen.queryByRole('heading', { name: 'Sign in' })).toBeNull();
    fireEvent.press(await screen.findByRole('button', { name: 'Create an account' }));
    expect(await screen.findByRole('heading', { name: 'Create an account' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Sign in' })).toBeNull();
    unmount();
    mockAccount = signedOut;
    render(<App />);
    fireEvent.press(await screen.findByRole('button', { name: 'I already have an account' }));
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeTruthy();
  });

  it('keeps the app mounted under the Join screen: what was typed is still there afterwards', async () => {
    jest.spyOn(Linking, 'getInitialURL').mockResolvedValue(null);
    const listeners: ((event: { url: string }) => void)[] = [];
    jest.spyOn(Linking, 'addEventListener').mockImplementation(((_type: string, fn: (event: { url: string }) => void) => {
      listeners.push(fn);
      return { remove: () => undefined };
    }) as never);
    signInAs(signedIn);
    mockAccept.mockResolvedValue({ ok: false, reason: 'unusable' });
    render(<App />);
    fireEvent.press(await screen.findByText(START_FIRST));
    fireEvent.changeText(await screen.findByLabelText('Their name, required'), 'Ben');
    await act(async () => listeners.forEach((fn) => fn({ url: LINK })));
    expect(await screen.findByRole('heading', { name: "This invitation can't be used" })).toBeTruthy();
    // Hidden from screen readers while the Join screen shows.
    expect(screen.queryByLabelText('Their name, required')).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByLabelText('Their name, required')).toHaveProp('value', 'Ben');
  });

  it('a second link during a join is not lost: the first clears only its own token, then the second is accepted', async () => {
    jest.spyOn(Linking, 'getInitialURL').mockResolvedValue(LINK);
    const listeners: ((event: { url: string }) => void)[] = [];
    jest.spyOn(Linking, 'addEventListener').mockImplementation(((_type: string, fn: (event: { url: string }) => void) => {
      listeners.push(fn);
      return { remove: () => undefined };
    }) as never);
    const SECOND = 'Yw9-' + 'm'.repeat(39);
    let first: (r: unknown) => void = () => undefined;
    let second: (r: unknown) => void = () => undefined;
    mockAccept.mockImplementationOnce(() => new Promise((resolve) => (first = resolve)));
    mockAccept.mockImplementationOnce(() => new Promise((resolve) => (second = resolve)));
    signInAs(signedIn);
    render(<App />);
    await waitFor(() => expect(mockAccept).toHaveBeenCalledTimes(1));
    await act(async () => listeners.forEach((fn) => fn({ url: `https://web.grieversguidance.com/join#t=${SECOND}` })));
    expect(JSON.parse((await stored()) ?? 'null').token).toBe(SECOND);
    await act(async () => first({ ok: false, reason: 'unusable' }));
    await waitFor(() => expect(mockAccept).toHaveBeenCalledTimes(2));
    expect(mockAccept).toHaveBeenLastCalledWith('access-token', SECOND);
    expect(JSON.parse((await stored()) ?? 'null').token).toBe(SECOND);
    await act(async () => second({ ok: true, ownerId: 'o1' }));
    await waitFor(async () => expect(await stored()).toBeNull());
  });

  it('after a join says "You\'re helping Anna now." in a live region and announces it on iOS', async () => {
    const ios = jest.replaceProperty(Platform, 'OS', 'ios');
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => undefined);
    announce.mockClear();
    signInAs(signedIn);
    mockAccept.mockResolvedValue({ ok: true, ownerId: 'o1' });
    render(<App />);
    const note = await screen.findByText("You're helping Anna now.", undefined, { timeout: 4000 });
    expect(note.props.accessibilityLiveRegion).toBe('polite');
    expect(announce).toHaveBeenCalledWith("You're helping Anna now.");
    expect(announce.mock.calls.filter(([text]) => text === "You're helping Anna now.")).toHaveLength(1);
    ios.restore();
  });

  it('says nothing about helping when the account was a member already', async () => {
    signInAs(signedIn);
    mockGetProfile.mockResolvedValue({ ok: true, profile: member });
    render(<App />);
    await waitFor(() => expect(reload).toHaveBeenCalled());
    expect(screen.queryByText(/You're helping/)).toBeNull();
  });

  /** Presses Android Back the way the OS does: the newest handler first, until one takes it. */
  function backHandlers() {
    const handlers: (() => boolean)[] = [];
    jest.spyOn(BackHandler, 'addEventListener').mockImplementation(((_event: string, handler: () => boolean) => {
      handlers.push(handler);
      return { remove: () => handlers.splice(handlers.indexOf(handler), 1) };
    }) as never);
    return () => {
      for (const handler of [...handlers].reverse()) {
        if (handler()) {
          return true;
        }
      }
      return false;
    };
  }

  it('Android Back does not reach the app under the Join screen', async () => {
    const pressBack = backHandlers();
    render(<App />);
    await screen.findByRole('heading', { name: "You've been asked to help" });
    await act(async () => {
      expect(pressBack()).toBe(true);
    });
    expect(screen.getByRole('heading', { name: "You've been asked to help" })).toBeTruthy();
  });

  it('Android Back on a message continues, like its button', async () => {
    const pressBack = backHandlers();
    signInAs(signedIn);
    mockAccept.mockResolvedValue({ ok: false, reason: 'unusable' });
    render(<App />);
    await screen.findByRole('heading', { name: "This invitation can't be used" });
    await act(async () => {
      expect(pressBack()).toBe(true);
    });
    expect(await screen.findByText("Who you're writing about")).toBeTruthy();
  });

  it('a signed-out person whose phone has a stale signed-in marker still gets sign-up from "Create an account"', async () => {
    mockLaunch = { hydrated: true, signedIn: true };
    mockAccount = signedOut;
    render(<App />);
    expect(await screen.findByRole('heading', { name: "You've been asked to help" })).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Create an account' }));
    expect(await screen.findByRole('heading', { name: 'Create an account' })).toBeTruthy();
  });

  it('first join offline, a second link mid-join: the first token is kept, then the second runs and storage ends empty', async () => {
    const listeners: ((event: { url: string }) => void)[] = [];
    jest.spyOn(Linking, 'addEventListener').mockImplementation(((_type: string, fn: (event: { url: string }) => void) => {
      listeners.push(fn);
      return { remove: () => undefined };
    }) as never);
    const SECOND = 'Yw9-' + 'm'.repeat(39);
    let first: (r: unknown) => void = () => undefined;
    mockAccept.mockImplementationOnce(() => new Promise((resolve) => (first = resolve)));
    mockAccept.mockResolvedValueOnce({ ok: true, ownerId: 'o1' });
    signInAs(signedIn);
    render(<App />);
    await waitFor(() => expect(mockAccept).toHaveBeenCalledTimes(1));
    await act(async () => listeners.forEach((fn) => fn({ url: `https://web.grieversguidance.com/join#t=${SECOND}` })));
    await act(async () => first({ ok: false, reason: 'offline' }));
    await waitFor(() => expect(mockAccept).toHaveBeenCalledTimes(2));
    expect(mockAccept).toHaveBeenLastCalledWith('access-token', SECOND);
    await waitFor(async () => expect(await stored()).toBeNull());
  });

  describe('the joined note', () => {
    it('goes away 10 seconds after the join', async () => {
      jest.useFakeTimers({ advanceTimers: true });
      try {
        signInAs(signedIn);
        mockAccept.mockResolvedValue({ ok: true, ownerId: 'o1' });
        render(<App />);
        expect(await screen.findByText("You're helping Anna now.")).toBeTruthy();
        await act(async () => {
          await jest.advanceTimersByTimeAsync(10_500);
        });
        expect(screen.queryByText("You're helping Anna now.")).toBeNull();
      } finally {
        jest.useRealTimers();
      }
    });

    it('uses "someone" and still goes away when the list cannot be read', async () => {
      jest.useFakeTimers({ advanceTimers: true });
      try {
        mockGetMembers.mockResolvedValue({ ok: false, reason: 'offline' });
        signInAs(signedIn);
        mockAccept.mockResolvedValue({ ok: true, ownerId: 'o1' });
        render(<App />);
        expect(await screen.findByText("You're helping someone now.")).toBeTruthy();
        await act(async () => {
          await jest.advanceTimersByTimeAsync(10_500);
        });
        expect(screen.queryByText(/You're helping/)).toBeNull();
      } finally {
        jest.useRealTimers();
      }
    });
  });
});
