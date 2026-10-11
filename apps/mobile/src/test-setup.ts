import { jest } from '@jest/globals';

// An in-memory AsyncStorage made of plain functions. The package's own jest mock is built from
// jest.fn(), and specs that call jest.restoreAllMocks() wipe those implementations.
jest.mock('@react-native-async-storage/async-storage', () => {
  const store = new Map<string, string>();
  const asyncStorage = {
    getItem: async (key: string) => store.get(key) ?? null,
    setItem: async (key: string, value: string) => void store.set(key, value),
    removeItem: async (key: string) => void store.delete(key),
    clear: async () => store.clear(),
  };
  return { __esModule: true, default: asyncStorage, ...asyncStorage };
});

// Native-only module: its real entry fails to load outside a device.
jest.mock('expo-contacts', () => ({
  Fields: {},
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  getContactsAsync: jest.fn(),
}));
