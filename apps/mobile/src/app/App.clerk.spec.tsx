import { describe, expect, it, jest } from '@jest/globals';
import type { ReactNode } from 'react';
import { render, screen } from '@testing-library/react-native';

// Each spec file has its own module registry, so setting these before App is first required is enough.
process.env.EXPO_PUBLIC_FEATURE_AUTH = 'true';
process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY = 'pk_test_example';

const mockProviderProps = jest.fn();
// Clerk never finishes loading here (as when the phone is offline on first launch).
jest.mock('@clerk/expo', () => ({
  ClerkProvider: (props: { children: ReactNode }) => {
    mockProviderProps(props);
    return props.children;
  },
  useAuth: () => ({ isLoaded: false, isSignedIn: undefined, userId: undefined, sessionId: undefined, getToken: jest.fn(), signOut: jest.fn() }),
  useSignIn: jest.fn(),
  useSignUp: jest.fn(),
  useSSO: jest.fn(),
}));
jest.mock('@clerk/expo/token-cache', () => ({ tokenCache: { name: 'tokenCache' } }));
jest.mock('@clerk/expo/resource-cache', () => ({ resourceCache: { name: 'resourceCache' } }));

const { App } = require('./App') as typeof import('./App');

describe('App with the account feature and a Clerk key on', () => {
  it('renders the send flow at once while Clerk is still loading', async () => {
    render(<App />);
    expect(await screen.findByText('Your account')).toBeTruthy();
  });

  it('mounts Clerk with the publishable key, the secure token cache and the resource cache', () => {
    render(<App />);
    expect(mockProviderProps).toHaveBeenCalledWith(
      expect.objectContaining({
        publishableKey: 'pk_test_example',
        tokenCache: { name: 'tokenCache' },
        __experimental_resourceCache: { name: 'resourceCache' },
      }),
    );
  });
});
