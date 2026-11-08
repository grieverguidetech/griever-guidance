import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import { BackHandler } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ProfileResult } from '@griever/api-client';

// The whole app, with the account feature on and a fake Clerk, driven through the real delete flow:
// the panel, the Clerk delete, deleteLocalData, then the reset in App.tsx and the account provider.
process.env.EXPO_PUBLIC_FEATURE_AUTH = 'true';
process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY = 'pk_test_example';

// Jest has no native view tree, so findNodeHandle returns null; focus needs a handle.
jest.mock('react-native/Libraries/ReactNative/RendererProxy', () => ({
  ...jest.requireActual<object>('react-native/Libraries/ReactNative/RendererProxy'),
  findNodeHandle: () => 1,
}));

let mockSignedIn = true;
const mockListeners = new Set<() => void>();
const mockSetSignedIn = (value: boolean) => {
  mockSignedIn = value;
  mockListeners.forEach((listener) => listener());
};
const useSignedIn = () =>
  useSyncExternalStore(
    (listener) => {
      mockListeners.add(listener);
      return () => {
        mockListeners.delete(listener);
      };
    },
    () => mockSignedIn,
  );
const mockDelete = jest.fn<() => Promise<void>>();

jest.mock('@clerk/expo', () => ({
  ClerkProvider: ({ children }: { children: ReactNode }) => children,
  useAuth: () => {
    const signedIn = useSignedIn();
    return { isLoaded: true, isSignedIn: signedIn, userId: signedIn ? 'user_1' : null, getToken: async () => (signedIn ? 'tok' : null), signOut: async () => mockSetSignedIn(false) };
  },
  useClerk: () => ({ status: 'ready', loaded: true, buildUserProfileUrl: () => 'https://accounts.example.com/user' }),
  useUser: () => {
    const signedIn = useSignedIn();
    return { user: signedIn ? { primaryEmailAddress: { emailAddress: 'sam@example.com' }, delete: () => mockDelete() } : null };
  },
  useReverification: (fn: (...args: never[]) => unknown) => fn,
  useSignIn: () => ({ signIn: { status: 'needs_first_factor' } }),
  useSignUp: () => ({ signUp: { status: 'missing_requirements' } }),
  useSSO: () => ({ startSSOFlow: jest.fn() }),
}));
jest.mock('@clerk/expo/token-cache', () => ({ tokenCache: undefined }));
jest.mock('@clerk/expo/resource-cache', () => ({ resourceCache: undefined }));
jest.mock('expo-auth-session', () => ({ makeRedirectUri: () => 'grieversguidance://sso-callback' }));
jest.mock('@griever/api-client', () => ({
  ...jest.requireActual<object>('@griever/api-client'),
  getProfile: async (): Promise<ProfileResult> => ({
    ok: true,
    profile: { id: 'user_1', senderName: 'Sam', contactSource: null, firstName: 'Sam', lastName: null, fullName: 'Sam', birthDate: null, address: null, accountType: 'owner', createdAt: 'x', updatedAt: 'x' },
  }),
}));

const { App } = require('./App') as typeof import('./App');

const anna = {
  id: 'a', flowId: 'flow-a', ownerId: null, role: 'owner', personName: 'Anna', dateOfPassing: '', senderName: '', obituaryUrl: '',
  createdAt: '2026-10-01T00:00:00.000Z', lastOpenedAt: '2026-10-01T00:00:00.000Z', drafts: {}, serviceReady: false,
  recipientsNotified: {}, momentCompletedAt: {}, remindersScheduled: [],
};

const press = (name: string | RegExp) => fireEvent.press(screen.getByRole('button', { name }));

/** Signed in as Sam with Anna on the phone: open Anna, then Your account, then the confirm step, then the deliberate button. */
async function deleteTheAccount() {
  fireEvent.press(await screen.findByLabelText('Anna'));
  await screen.findByText('Ready to send');
  press('Your account');
  await screen.findByDisplayValue('Sam');
  press('Delete my account');
  press('Yes, delete my account');
  await screen.findByRole('heading', { name: 'Your account is deleted' });
}

beforeEach(async () => {
  jest.restoreAllMocks();
  mockSignedIn = true;
  mockDelete.mockReset().mockImplementation(async () => mockSetSignedIn(false));
  await AsyncStorage.clear();
  await AsyncStorage.setItem('gg.signedIn.v1', 'user_1');
  await AsyncStorage.setItem('gg.sessions.v1', JSON.stringify([anna]));
  await AsyncStorage.setItem('gg.publisherEmail.v1.a', 'obits@paper.example');
});

/** Nothing old is on screen or on the phone, and the first screen is the signed-out one. */
async function expectCleanSignedOutStart() {
  expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeTruthy();
  expect(screen.queryByLabelText('Anna')).toBeNull();
  expect(screen.queryByText('Ready to send')).toBeNull();
  // Let anything still writing finish, then look at the phone.
  await act(async () => new Promise<void>((resolve) => setTimeout(resolve, 50)));
  const keys = await AsyncStorage.getAllKeys();
  const saved = (await Promise.all(keys.map((key) => AsyncStorage.getItem(key)))).join('');
  expect(saved).not.toContain('Anna');
  expect(keys).not.toContain('gg.publisherEmail.v1.a');
  expect(keys).not.toContain('gg.signedIn.v1');
}

describe('after the account is deleted (#719)', () => {
  it('Back to the start lands on a clean, signed-out first screen, and nothing old is written back', async () => {
    render(<App />);
    await deleteTheAccount();
    expect(mockDelete).toHaveBeenCalledTimes(1);
    expect(screen.getByText('What you saved is being removed from our servers.')).toBeTruthy();
    expect(screen.queryByText('Some things could not be removed from this device.')).toBeNull();
    // The old people are already gone from memory while the deleted screen shows.
    expect(screen.queryByLabelText('Anna')).toBeNull();
    press('Back to the start');
    await expectCleanSignedOutStart();
  });

  it('Android Back from the deleted screen lands on the same clean start', async () => {
    const handlers: (() => boolean)[] = [];
    jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_event, handler) => {
      handlers.push(handler as () => boolean);
      return { remove: () => void handlers.splice(handlers.indexOf(handler as () => boolean), 1) };
    });
    render(<App />);
    await deleteTheAccount();
    let handled = false;
    act(() => {
      handled = handlers[handlers.length - 1]?.() ?? false;
    });
    expect(handled).toBe(true);
    await expectCleanSignedOutStart();
  });

  it('a failed delete changes nothing on screen or on the phone', async () => {
    mockDelete.mockRejectedValue(new Error('offline'));
    render(<App />);
    fireEvent.press(await screen.findByLabelText('Anna'));
    await screen.findByText('Ready to send');
    press('Your account');
    await screen.findByDisplayValue('Sam');
    press('Delete my account');
    press('Yes, delete my account');
    await screen.findByText(/We could not finish deleting your account/);
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Your account is deleted' })).toBeNull());
    expect(await AsyncStorage.getItem('gg.sessions.v1')).toContain('Anna');
    expect(await AsyncStorage.getItem('gg.publisherEmail.v1.a')).toBe('obits@paper.example');
  });
});
