import { describe, expect, it, jest } from '@jest/globals';
import { render, screen, waitFor } from '@testing-library/react-native';
import { Linking } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Sharing is on, accounts are off: there is no account to join with, so a saved link is thrown away.
process.env.EXPO_PUBLIC_FEATURE_AUTH = 'false';
process.env.EXPO_PUBLIC_FEATURE_SHARING = 'true';

const mockAccept = jest.fn();
jest.mock('@griever/api-client', () => ({
  ...jest.requireActual<object>('@griever/api-client'),
  acceptInvite: (...args: unknown[]) => mockAccept(...args),
}));
const { App } = require('./App') as typeof import('./App');

const TOKEN = 'Zq3_' + 'k'.repeat(39);

describe('invitation link with accounts off', () => {
  it('discards a saved token, never accepts, and opens the normal first screen', async () => {
    jest.spyOn(Linking, 'getInitialURL').mockResolvedValue(`https://web.grieversguidance.com/join#t=${TOKEN}`);
    await AsyncStorage.setItem('gg.join.v1', JSON.stringify({ token: TOKEN, savedAt: Date.now() }));
    render(<App />);
    expect(await screen.findByText("Who you're writing about")).toBeTruthy();
    await waitFor(async () => expect(await AsyncStorage.getItem('gg.join.v1')).toBeNull());
    expect(screen.queryByText("You've been asked to help")).toBeNull();
    expect(mockAccept).not.toHaveBeenCalled();
  });
});
