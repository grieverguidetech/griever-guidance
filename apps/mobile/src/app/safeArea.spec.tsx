import { describe, expect, it, jest } from '@jest/globals';
import { StyleSheet, View } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Session } from '@griever/hooks';
import { colors } from '@griever/tokens';
import { App } from './App';
import { SESSIONS_KEY } from '../lib/useDeviceSessions';

jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual<object>('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 47, bottom: 0, left: 0, right: 0 }),
}));

const anna = {
  id: 'a', flowId: 'flow-a', ownerId: null, role: 'owner', personName: 'Anna', dateOfPassing: '', senderName: '', obituaryUrl: '',
  createdAt: '2026-10-01T00:00:00.000Z', lastOpenedAt: '2026-10-01T00:00:00.000Z',
  drafts: {}, serviceReady: false, recipientsNotified: {}, momentCompletedAt: {}, remindersScheduled: [],
} as unknown as Session;

describe('send steps and the top safe area', () => {
  it('pads a step by the top inset, on the page colour (no white band)', async () => {
    await AsyncStorage.setItem(SESSIONS_KEY, JSON.stringify([anna]));
    render(<App />);
    fireEvent.press(await screen.findByLabelText('Anna'));
    fireEvent.press(await screen.findByRole('button', { name: 'Start' }));
    await screen.findByLabelText(/Anything you'd like to add/);
    const padded = screen.UNSAFE_getAllByType(View).some((v) => {
      const style = StyleSheet.flatten(v.props.style) ?? {};
      return style.paddingTop === 47 && style.backgroundColor === colors.bg;
    });
    expect(padded).toBe(true);
  });
});
