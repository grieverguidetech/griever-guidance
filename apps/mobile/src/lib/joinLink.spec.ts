import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Linking } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { JOIN_MAX_AGE_MS, JOIN_STORAGE_KEY, clearJoinToken, joinOutcome, savedJoinToken, watchJoinLink } from './joinLink';

const TOKEN = 'Zq3_' + 'k'.repeat(39);
const LINK = `https://web.grieversguidance.com/join#t=${TOKEN}`;
const NOW = 1_800_000_000_000;

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  jest.restoreAllMocks();
  jest.spyOn(Linking, 'getInitialURL').mockResolvedValue(null);
  jest.spyOn(Linking, 'addEventListener').mockReturnValue({ remove: jest.fn() } as never);
});

describe('saved token', () => {
  it('is read back while it is fresh', async () => {
    await AsyncStorage.setItem(JOIN_STORAGE_KEY, JSON.stringify({ token: TOKEN, savedAt: NOW }));
    expect(await savedJoinToken(NOW + JOIN_MAX_AGE_MS - 1)).toBe(TOKEN);
  });

  it('is dropped after 7 days', async () => {
    await AsyncStorage.setItem(JOIN_STORAGE_KEY, JSON.stringify({ token: TOKEN, savedAt: NOW }));
    expect(await savedJoinToken(NOW + JOIN_MAX_AGE_MS)).toBeNull();
    expect(await AsyncStorage.getItem(JOIN_STORAGE_KEY)).toBeNull();
  });

  it('drops a broken or foreign entry', async () => {
    await AsyncStorage.setItem(JOIN_STORAGE_KEY, 'not json');
    expect(await savedJoinToken(NOW)).toBeNull();
    await AsyncStorage.setItem(JOIN_STORAGE_KEY, JSON.stringify({ token: 'short', savedAt: NOW }));
    expect(await savedJoinToken(NOW)).toBeNull();
    expect(await AsyncStorage.getItem(JOIN_STORAGE_KEY)).toBeNull();
  });

  it('is taken once: after clear nothing is left', async () => {
    await AsyncStorage.setItem(JOIN_STORAGE_KEY, JSON.stringify({ token: TOKEN, savedAt: Date.now() }));
    await clearJoinToken();
    expect(await savedJoinToken()).toBeNull();
  });
});

describe('watchJoinLink', () => {
  it('reports the link the app opened with and saves {token, savedAt}', async () => {
    jest.spyOn(Linking, 'getInitialURL').mockResolvedValue(LINK);
    const seen = jest.fn();
    watchJoinLink(seen);
    await flush();
    expect(seen).toHaveBeenCalledWith(TOKEN);
    const saved = JSON.parse((await AsyncStorage.getItem(JOIN_STORAGE_KEY)) ?? 'null') as { token: string; savedAt: number };
    expect(saved.token).toBe(TOKEN);
    expect(typeof saved.savedAt).toBe('number');
  });

  it('reports a saved token when the app opened without a link', async () => {
    await AsyncStorage.setItem(JOIN_STORAGE_KEY, JSON.stringify({ token: TOKEN, savedAt: Date.now() }));
    const seen = jest.fn();
    watchJoinLink(seen);
    await flush();
    expect(seen).toHaveBeenCalledWith(TOKEN);
  });

  it('reports a link that arrives later, and stops after the returned function is called', async () => {
    const remove = jest.fn();
    let listener: (event: { url: string }) => void = () => undefined;
    jest.spyOn(Linking, 'addEventListener').mockImplementation(((_type: string, fn: (event: { url: string }) => void) => {
      listener = fn;
      return { remove };
    }) as never);
    const seen = jest.fn();
    const stop = watchJoinLink(seen);
    await flush();
    listener({ url: LINK });
    await flush();
    expect(seen).toHaveBeenCalledTimes(1);
    stop();
    expect(remove).toHaveBeenCalled();
    listener({ url: LINK });
    await flush();
    expect(seen).toHaveBeenCalledTimes(1);
  });

  it('ignores a query-string link, the custom scheme and other hosts', async () => {
    let listener: (event: { url: string }) => void = () => undefined;
    jest.spyOn(Linking, 'addEventListener').mockImplementation(((_type: string, fn: (event: { url: string }) => void) => {
      listener = fn;
      return { remove: jest.fn() };
    }) as never);
    const seen = jest.fn();
    watchJoinLink(seen);
    await flush();
    for (const url of [
      `https://web.grieversguidance.com/join?t=${TOKEN}`,
      `grieversguidance://join#t=${TOKEN}`,
      `mobile://join#t=${TOKEN}`,
      `https://evil.test/join#t=${TOKEN}`,
    ]) {
      listener({ url });
    }
    await flush();
    expect(seen).not.toHaveBeenCalled();
    expect(await AsyncStorage.getItem(JOIN_STORAGE_KEY)).toBeNull();
  });
});

describe('joinOutcome', () => {
  it('maps answers as web does', () => {
    expect(joinOutcome(null)).toBe('offline');
    expect(joinOutcome({ ok: true, ownerId: 'o' })).toBe('joined');
    expect(joinOutcome({ ok: false, reason: 'unusable' })).toBe('unusable');
    expect(joinOutcome({ ok: false, reason: 'invalid' })).toBe('unusable');
    expect(joinOutcome({ ok: false, reason: 'forbidden' })).toBe('unusable');
    expect(joinOutcome({ ok: false, reason: 'conflict' })).toBe('conflict');
    expect(joinOutcome({ ok: false, reason: 'offline' })).toBe('offline');
    expect(joinOutcome({ ok: false, reason: 'rate_limited' })).toBe('later');
    expect(joinOutcome({ ok: false, reason: 'signed_out' })).toBe('later');
  });
});
