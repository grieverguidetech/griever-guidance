import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, render, screen } from '@testing-library/react-native';

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
  useClerk: () => ({ status: 'loading' }),
  useSignIn: jest.fn(),
  useSignUp: jest.fn(),
  useSSO: jest.fn(),
}));
jest.mock('@clerk/expo/token-cache', () => ({ tokenCache: { name: 'tokenCache' } }));
jest.mock('@clerk/expo/resource-cache', () => ({ resourceCache: { name: 'resourceCache' } }));

const { App } = require('./App') as typeof import('./App');

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('App with the account feature and a Clerk key on', () => {
  it('no marker and Clerk still loading (offline): opens on the account screen, and Back reaches Home', async () => {
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Your account' })).toBeTruthy();
    expect(screen.getByText('One moment.')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Back' }));
    expect(await screen.findByText("Who you're writing about")).toBeTruthy();
  });

  it('opens the normal first screen at once when the device holds a signed-in marker, though Clerk is still loading', async () => {
    await AsyncStorage.setItem('gg.signedIn.v1', 'user_1');
    render(<App />);
    expect(await screen.findByText("Who you're writing about")).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Sign in' })).toBeNull();
  });

  it('mounts Clerk with the publishable key, the secure token cache and the resource cache', async () => {
    await AsyncStorage.setItem('gg.signedIn.v1', 'user_1');
    render(<App />);
    await screen.findByText('Your account');
    expect(mockProviderProps).toHaveBeenCalledWith(
      expect.objectContaining({
        publishableKey: 'pk_test_example',
        tokenCache: { name: 'tokenCache' },
        __experimental_resourceCache: { name: 'resourceCache' },
      }),
    );
  });
});
