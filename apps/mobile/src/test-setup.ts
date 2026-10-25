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
    clear: async () => fresh().clear(),
  };
  return { __esModule: true, default: asyncStorage, ...asyncStorage };
});

// Native-only module: its real entry fails to load outside a device.
jest.mock('expo-contacts', () => ({
  Fields: { Name: 'name', PhoneNumbers: 'phoneNumbers', Emails: 'emails' },
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  getContactsAsync: jest.fn(),
}));

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
