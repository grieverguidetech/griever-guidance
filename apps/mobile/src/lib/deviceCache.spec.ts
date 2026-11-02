import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createDeviceCache, isPersisting, resetPersisting, subscribePersisting } from './deviceCache';

beforeEach(async () => {
  await AsyncStorage.clear();
  resetPersisting();
});
afterEach(() => {
  jest.restoreAllMocks();
  resetPersisting();
});

describe('deviceCache persisting state', () => {
  it('is persisting after a clean hydrate and a good write', async () => {
    const cache = createDeviceCache([{ key: 'k', json: false }]);
    await cache.hydrate();
    cache.setItem('k', 'v');
    await Promise.resolve();
    expect(isPersisting()).toBe(true);
    expect(await AsyncStorage.getItem('k')).toBe('v');
  });

  it('is not persisting when a read fails, and writes stay in memory only', async () => {
    jest.spyOn(AsyncStorage, 'getItem').mockRejectedValue(new Error('unreadable'));
    const setItem = jest.spyOn(AsyncStorage, 'setItem');
    const cache = createDeviceCache([{ key: 'k', json: false }]);
    const heard = jest.fn();
    subscribePersisting(heard);
    await cache.hydrate();
    expect(isPersisting()).toBe(false);
    expect(heard).toHaveBeenCalled();
    cache.setItem('k', 'v');
    expect(cache.getItem('k')).toBe('v');
    expect(setItem).not.toHaveBeenCalled();
  });

  it('is not persisting when saved JSON does not parse', async () => {
    await AsyncStorage.setItem('k', '{broken');
    const cache = createDeviceCache([{ key: 'k', json: true }]);
    await cache.hydrate();
    expect(isPersisting()).toBe(false);
  });

  it('is not persisting after a write fails, and recovers after a good write', async () => {
    const cache = createDeviceCache([{ key: 'k', json: false }]);
    await cache.hydrate();
    jest.spyOn(AsyncStorage, 'setItem').mockRejectedValueOnce(new Error('disk full'));
    cache.setItem('k', 'one');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(isPersisting()).toBe(false);
    cache.setItem('k', 'two');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(isPersisting()).toBe(true);
  });
});
