import { jest } from '@jest/globals';

// An in-memory AsyncStorage made of plain functions. The package's own jest mock is built from
// jest.fn(), and specs that call jest.restoreAllMocks() wipe those implementations.
jest.mock('@react-native-async-storage/async-storage', () => {
  const store = new Map<string, string>();
  // setupFiles cannot register a beforeEach, and jest.config.cjs is not ours to change here. So the
  // store empties itself the first time it is used in a new test, and no test sees another's data.
  let owner: string | undefined;
  const fresh = () => {
    const current = (globalThis as unknown as { expect: { getState(): { currentTestName?: string } } }).expect.getState().currentTestName;
    if (current !== owner) {
      owner = current;
      store.clear();
    }
    return store;
  };
  const asyncStorage = {
    getItem: async (key: string) => fresh().get(key) ?? null,
    setItem: async (key: string, value: string) => void fresh().set(key, value),
    removeItem: async (key: string) => void fresh().delete(key),
    getAllKeys: async () => [...fresh().keys()],
    multiSet: async (pairs: [string, string][]) => void pairs.forEach(([key, value]) => fresh().set(key, value)),
    multiRemove: async (keys: string[]) => void keys.forEach((key) => fresh().delete(key)),
    clear: async () => fresh().clear(),
  };
  return { __esModule: true, default: asyncStorage, ...asyncStorage };
});

// The safe-area provider waits for a native measurement that never comes under Jest; the package ships
// a mock with fixed zero insets (a spec can still override useSafeAreaInsets).
jest.mock('react-native-safe-area-context', () => (jest.requireActual('react-native-safe-area-context/jest/mock') as { default: object }).default);

// Native-only module: its real entry fails to load outside a device. Mirrors expo-contacts 58:
// the package root keeps only stubs that throw (build/legacyWarnings.js); the working
// module-level API is under `expo-contacts/legacy`. Keep these shapes in step with the package.
jest.mock('expo-contacts', () => {
  const deprecated = () => jest.fn(async () => {
    throw new Error('Method imported from "expo-contacts" is deprecated.');
  });
  return {
    getContactsAsync: deprecated(),
    getPermissionsAsync: deprecated(),
    requestPermissionsAsync: deprecated(),
  };
});
jest.mock('expo-contacts/legacy', () => ({
  Fields: { Name: 'name', PhoneNumbers: 'phoneNumbers', Emails: 'emails' },
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  getContactsAsync: jest.fn(),
}));

// Native-only module: its entry needs the native ExpoMailComposer and fails to load under Jest. By default the
// in-app composer is "unavailable", so the code falls back to mailto: (a spec can mock it again).
jest.mock('expo-mail-composer', () => ({ isAvailableAsync: jest.fn(async () => false), composeAsync: jest.fn() }));

// @clerk/clerk-js opens a BroadcastChannel as soon as it is imported and never closes it. Under
// Jest 30 that open port keeps the test process alive after the last test, so a run with a single
// worker (CI=true on a small runner) never exits. Unref every channel so it cannot hold the process.
const NativeBroadcastChannel = (globalThis as { BroadcastChannel?: typeof BroadcastChannel }).BroadcastChannel;
if (NativeBroadcastChannel) {
  class UnrefedBroadcastChannel extends NativeBroadcastChannel {
    constructor(name: string) {
      super(name);
      (this as unknown as { unref?: () => void }).unref?.();
    }
  }
  (globalThis as { BroadcastChannel?: typeof BroadcastChannel }).BroadcastChannel = UnrefedBroadcastChannel;
}

// Native-only module: Jest has no native view for it. The stand-in renders a plain view that keeps
// its props, so a spec can call the picker's onChange the way the OS would. The Android dialog is a
// jest.fn() that records what it was opened with.
jest.mock('@react-native-community/datetimepicker', () => {
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  const React = jest.requireActual<typeof import('react')>('react');
  const DateTimePicker = (props: Record<string, unknown>) => React.createElement(View, { testID: 'date-picker', ...props });
  return { __esModule: true, default: DateTimePicker, DateTimePickerAndroid: { open: jest.fn(), dismiss: jest.fn() } };
});

// No test may reach a real server (the gateway, Google). A spec that needs fetch stubs it itself.
globalThis.fetch = (async (input: unknown) => {
  throw new Error(`Unstubbed fetch in a test: ${String(input)}`);
}) as typeof fetch;
