import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
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
jest.mock('expo-auth-session', () => ({ makeRedirectUri: () => 'mobile://sso-callback' }));

const { App } = require('./App') as typeof import('./App');

const account = (over: Partial<UseAccountResult>): UseAccountResult => ({
  status: 'signed_out',
  isSignedIn: false,
  isLoading: false,
  offline: false,
  profile: null,
  error: null,
  clearError: () => undefined,
  signOut: async () => undefined,
  updateSenderName: async () => true,
  ...over,
});
const named = { id: 'u1', senderName: 'Sam', contactSource: null, accountType: 'owner' as const };
const loading = account({ status: 'loading', isLoading: true });
const signedOut = account({});
const signedIn = account({ status: 'signed_in', isSignedIn: true, profile: named });

beforeEach(() => {
  mockAccount = signedOut;
  mockLaunch = { hydrated: true, signedIn: false };
});

describe('first screen with accounts on', () => {
  it('opens on sign-in when nobody is signed in', async () => {
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeTruthy();
    expect(screen.queryByText("Who you're writing about")).toBeNull();
  });

  it('opens on the normal first screen when already signed in', async () => {
    mockAccount = signedIn;
    mockLaunch = { hydrated: true, signedIn: true };
    render(<App />);
    expect(await screen.findByText("Who you're writing about")).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Sign in' })).toBeNull();
  });

  it('shows Opening and no sign-in or Home until the local cache is read', async () => {
    mockAccount = loading;
    mockLaunch = { hydrated: false, signedIn: false };
    render(<App />);
    expect(await screen.findByText('Opening…')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Sign in' })).toBeNull();
    expect(screen.queryByText("Who you're writing about")).toBeNull();
  });

  it('opens on sign-in once the cache is read and holds no signed-in marker, even while Clerk is slow', async () => {
    mockAccount = loading;
    mockLaunch = { hydrated: false, signedIn: false };
    render(<App />);
    await screen.findByText('Opening…');
    act(() => {
      mockLaunch = { hydrated: true, signedIn: false };
      mockSetAccount.current(loading);
    });
    expect(await screen.findByRole('heading', { name: 'Your account' })).toBeTruthy();
    expect(screen.getByText('One moment.')).toBeTruthy();
  });

  it('accounts unavailable (no configuration): the normal first screen', async () => {
    mockAccount = null;
    mockLaunch = null;
    render(<App />);
    expect(await screen.findByText("Who you're writing about")).toBeTruthy();
  });

  it('after sign-in with a name, lands on the normal first screen', async () => {
    render(<App />);
    await screen.findByRole('heading', { name: 'Sign in' });
    act(() => mockSetAccount.current(signedIn));
    expect(await screen.findByText("Who you're writing about")).toBeTruthy();
  });

  it('after sign-in without a name, asks for the name first and stays there', async () => {
    render(<App />);
    await screen.findByRole('heading', { name: 'Sign in' });
    act(() => mockSetAccount.current(account({ status: 'signed_in', isSignedIn: true })));
    expect(await screen.findByRole('heading', { name: 'What should we call you?' })).toBeTruthy();
  });

  it('a session that ends later keeps the person on Home', async () => {
    mockAccount = signedIn;
    mockLaunch = { hydrated: true, signedIn: true };
    render(<App />);
    await screen.findByText("Who you're writing about");
    act(() => mockSetAccount.current(signedOut));
    expect(screen.getByText("Who you're writing about")).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Sign in' })).toBeNull();
  });

  it('Back from the first sign-in screen goes to the normal first screen', async () => {
    render(<App />);
    await screen.findByRole('heading', { name: 'Sign in' });
    fireEvent.press(screen.getByRole('button', { name: 'Back' }));
    expect(await screen.findByText("Who you're writing about")).toBeTruthy();
  });

  it('Back from the first sign-in screen leaves it for good: Home is Home after a flow', async () => {
    render(<App />);
    await screen.findByRole('heading', { name: 'Sign in' });
    fireEvent.press(screen.getByRole('button', { name: 'Back' }));
    fireEvent.press(await screen.findByText("Start with someone I've lost"));
    fireEvent.press(await screen.findByLabelText('Back to home'));
    expect(await screen.findByText("Who you're writing about")).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Sign in' })).toBeNull();
  });

  it('Sign out on the account screen keeps the person on sign-in', async () => {
    mockAccount = account({
      status: 'signed_in',
      isSignedIn: true,
      profile: named,
      signOut: async () => mockSetAccount.current(signedOut),
    });
    mockLaunch = { hydrated: true, signedIn: true };
    render(<App />);
    fireEvent.press(await screen.findByText('Your account'));
    fireEvent.press(await screen.findByText('Sign out'));
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeTruthy();
  });
});
