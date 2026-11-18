import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { render, screen, waitFor } from '@testing-library/react-native';
import { Linking } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Accounts are on, sharing is off: a saved invitation link is thrown away and the app is as it was.
process.env.EXPO_PUBLIC_FEATURE_AUTH = 'true';
process.env.EXPO_PUBLIC_FEATURE_SHARING = 'false';
process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY = 'pk_test_example';

const mockAccount = {
  status: 'signed_in', isSignedIn: true, isLoading: false, offline: false,
  profile: { id: 'u1', senderName: 'Sam', contactSource: null, accountType: 'owner' }, profileAnswered: true, profileLoaded: true,
  error: null, clearError: () => undefined, signOut: async () => undefined, updateDetails: async () => ({ ok: false, invalid: false }), updateSenderName: async () => true,
};
jest.mock('../lib/AccountProvider', () => ({
  ...jest.requireActual<object>('../lib/AccountProvider'),
  AccountProvider: (props: { children: unknown }) => props.children,
  useAccount: () => mockAccount,
  useLaunchState: () => ({ hydrated: true, signedIn: true }),
  useSyncAuth: () => ({ status: 'signed_in', userId: 'u1', getToken: async () => 'access-token' }),
}));
const mockAccept = jest.fn();
jest.mock('@griever/api-client', () => ({
  ...jest.requireActual<object>('@griever/api-client'),
  acceptInvite: (...args: unknown[]) => mockAccept(...args),
}));
const { App } = require('./App') as typeof import('./App');

const TOKEN = 'Zq3_' + 'k'.repeat(39);

beforeEach(() => {
  jest.spyOn(Linking, 'getInitialURL').mockResolvedValue(`https://web.grieversguidance.com/join#t=${TOKEN}`);
  jest.spyOn(Linking, 'addEventListener').mockReturnValue({ remove: () => undefined } as never);
});

describe('invitation link with sharing off', () => {
  it('discards a saved token, never accepts, and opens the normal first screen', async () => {
    await AsyncStorage.setItem('gg.join.v1', JSON.stringify({ token: TOKEN, savedAt: Date.now() }));
    render(<App />);
    expect(await screen.findByText("Who you're writing about")).toBeTruthy();
    await waitFor(async () => expect(await AsyncStorage.getItem('gg.join.v1')).toBeNull());
    expect(screen.queryByText("You've been asked to help")).toBeNull();
    expect(mockAccept).not.toHaveBeenCalled();
  });
});
