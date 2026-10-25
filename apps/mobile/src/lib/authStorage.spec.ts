import { describe, expect, it } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createProfileCache } from './authStorage';

describe('createProfileCache', () => {
  it('reads the profile and the signed-in marker synchronously after hydrating from AsyncStorage', async () => {
    await AsyncStorage.setItem('gg.profile.v1', '{"senderName":"Sam","contactSource":null}');
    await AsyncStorage.setItem('gg.signedIn.v1', 'u1');
    const cache = createProfileCache();
    expect(cache.getItem('gg.profile.v1')).toBeNull();
    await cache.hydrate();
    expect(cache.getItem('gg.profile.v1')).toBe('{"senderName":"Sam","contactSource":null}');
    expect(cache.getItem('gg.signedIn.v1')).toBe('u1');
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
