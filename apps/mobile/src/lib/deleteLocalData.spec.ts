import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { deleteLocalData } from './deleteLocalData';
import { publisherEmailKey } from './mailCompose';

// The shared test setup's AsyncStorage has no getAllKeys; deleteLocalData lists keys, so this spec uses a fuller in-memory one.
jest.mock('@react-native-async-storage/async-storage', () => {
  const store = new Map<string, string>();
  const asyncStorage = {
    getItem: async (key: string) => store.get(key) ?? null,
    setItem: async (key: string, value: string) => void store.set(key, value),
    removeItem: async (key: string) => void store.delete(key),
    getAllKeys: async () => [...store.keys()],
    multiSet: async (pairs: [string, string][]) => void pairs.forEach(([key, value]) => store.set(key, value)),
    clear: async () => store.clear(),
  };
  return { __esModule: true, default: asyncStorage, ...asyncStorage };
});

beforeEach(async () => {
  jest.restoreAllMocks();
  await AsyncStorage.clear();
});

describe('deleteLocalData', () => {
  it('removes people, contacts, publisher emails and the account cache, and leaves other apps keys alone', async () => {
    await AsyncStorage.multiSet([
      ['gg.sessions.v1', '[{"id":"anna","obituaryEmailedAt":"2026-01-01"}]'],
      ['gg.activeSession.v1', 'anna'],
      ['gg.contacts.v1', '[]'],
      ['gg.checklist.v1', '{}'],
      ['gg.profile.v1', '{}'],
      ['gg.signedIn.v1', 'u1'],
      ['gg.flowQueue.v1:u1', '[]'],
      [publisherEmailKey('anna'), 'obits@paper.example'],
      ['other.app.key', 'keep'],
    ]);
    expect(await deleteLocalData()).toBe(true);
    expect(await AsyncStorage.getAllKeys()).toEqual(['other.app.key']);
  });

  it('reports a leftover when one key cannot be removed, and still removes the rest', async () => {
    await AsyncStorage.multiSet([
      ['gg.sessions.v1', '[]'],
      ['gg.contacts.v1', '[]'],
    ]);
    const real = AsyncStorage.removeItem.bind(AsyncStorage);
    jest.spyOn(AsyncStorage, 'removeItem').mockImplementation(async (key: string) => {
      if (key === 'gg.contacts.v1') {
        throw new Error('disk');
      }
      return real(key);
    });
    expect(await deleteLocalData()).toBe(false);
    expect(await AsyncStorage.getAllKeys()).toEqual(['gg.contacts.v1']);
  });

  it('reports a leftover, without throwing, when the keys cannot be listed', async () => {
    jest.spyOn(AsyncStorage, 'getAllKeys').mockRejectedValue(new Error('disk'));
    expect(await deleteLocalData()).toBe(false);
  });
});
