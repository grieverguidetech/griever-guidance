import { AccessibilityInfo } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, render, screen } from '@testing-library/react-native';
import type { UseAccountResult } from '@griever/hooks';

process.env.EXPO_PUBLIC_FEATURE_AUTH = 'true';

// The account state is driven by hand: loading, signed out, signed in, offline.
let mockAccount: UseAccountResult | null = null; // eslint-disable-line prefer-const
let mockLaunch: { hydrated: boolean; signedIn: boolean } | null = { hydrated: true, signedIn: false }; // eslint-disable-line prefer-const
const mockSetAccount: { current: (a: UseAccountResult | null) => void } = { current: () => undefined };
jest.mock('../lib/AccountProvider', () => {
  const React = require('react') as typeof import('react');
  const Ctx = React.createContext<UseAccountResult | null>(null);
  return {
    useAccount: () => React.useContext(Ctx),
    useLaunchState: () => mockLaunch,
    useSyncAuth: () => null,
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

const { App } = require('./App') as typeof import('./App');

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
const named = { id: 'u1', senderName: 'Sam', contactSource: null, accountType: 'owner' as const };
const signedOut = account({});
const signedIn = account({ status: 'signed_in', isSignedIn: true, profile: named, profileAnswered: true, profileLoaded: true });

const anna = {
  id: 'a', flowId: 'flow-a', ownerId: null, role: 'owner', personName: 'Anna', dateOfPassing: '', senderName: '', obituaryUrl: '',
  createdAt: '2026-10-01T00:00:00.000Z', lastOpenedAt: '2026-10-01T00:00:00.000Z',
  drafts: {}, serviceReady: false, recipientsNotified: {}, momentCompletedAt: {}, remindersScheduled: [],
};

let say: jest.SpiedFunction<typeof AccessibilityInfo.announceForAccessibilityWithOptions>;
beforeEach(async () => {
  mockAccount = signedOut;
  mockLaunch = { hydrated: true, signedIn: false };
  say = jest.spyOn(AccessibilityInfo, 'announceForAccessibilityWithOptions').mockImplementation(() => undefined);
  say.mockClear(); // the platform mock keeps calls from earlier tests
  jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => undefined);
  await AsyncStorage.setItem('gg.sessions.v1', JSON.stringify([anna]));
  await AsyncStorage.setItem('gg.activeSession.v1', 'a');
});
afterEach(() => {
  jest.restoreAllMocks();
});

describe('opening on the last person with accounts on', () => {
  it('signed out: sign-in first, and leaving it lands on Home with no stale hub or announcement', async () => {
    render(<App />);
    await screen.findByRole('heading', { name: 'Sign in' });
    expect(screen.queryByText('For Anna')).toBeNull();
    act(() => mockSetAccount.current(signedIn));
    expect(await screen.findByText("Who you're writing about")).toBeTruthy();
    expect(screen.queryByText('For Anna')).toBeNull();
    expect(say).not.toHaveBeenCalled();
  });

  it('signed in: opens the hub and says who is open, once', async () => {
    mockAccount = signedIn;
    mockLaunch = { hydrated: true, signedIn: true };
    render(<App />);
    expect(await screen.findByText('For Anna')).toBeTruthy();
    expect(say).toHaveBeenCalledTimes(1);
    expect(say).toHaveBeenCalledWith('Now writing about Anna', { queue: true });
  });
});
