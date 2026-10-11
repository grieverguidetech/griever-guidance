import { describe, expect, it } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { authStorage, createProfileCache } from './authStorage';

describe('authStorage', () => {
  it('round-trips a value through AsyncStorage', async () => {
    await authStorage.setItem('sb-token', '{"a":1}');
    expect(await authStorage.getItem('sb-token')).toBe('{"a":1}');
    expect(await AsyncStorage.getItem('sb-token')).toBe('{"a":1}');
    await authStorage.removeItem('sb-token');
    expect(await authStorage.getItem('sb-token')).toBeNull();
  });
});

describe('createProfileCache', () => {
  it('reads synchronously after hydrating from AsyncStorage', async () => {
    await AsyncStorage.setItem('gg.profile.v1', '{"senderName":"Sam","contactSource":null}');
    const cache = createProfileCache();
    expect(cache.getItem('gg.profile.v1')).toBeNull();
    await cache.hydrate();
    expect(cache.getItem('gg.profile.v1')).toBe('{"senderName":"Sam","contactSource":null}');
  });

  it('writes through to AsyncStorage and removes from both', async () => {
    const cache = createProfileCache();
    cache.setItem('gg.profile.v1', 'x');
    expect(cache.getItem('gg.profile.v1')).toBe('x');
    await Promise.resolve();
    expect(await AsyncStorage.getItem('gg.profile.v1')).toBe('x');
    cache.removeItem('gg.profile.v1');
    expect(cache.getItem('gg.profile.v1')).toBeNull();
    await Promise.resolve();
    expect(await AsyncStorage.getItem('gg.profile.v1')).toBeNull();
  });
});
