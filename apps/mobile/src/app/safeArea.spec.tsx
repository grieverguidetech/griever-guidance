import { describe, expect, it, jest } from '@jest/globals';
import { Linking, StyleSheet, View } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Session } from '@griever/hooks';
import { colors } from '@griever/tokens';
import { App } from './App';
import { SESSIONS_KEY } from '../lib/useDeviceSessions';

jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual<{ default: object }>('react-native-safe-area-context/jest/mock').default,
  useSafeAreaInsets: () => ({ top: 47, bottom: 34, left: 0, right: 0 }),
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
    fireEvent.press(await screen.findByRole('button', { name: /Next/ }));
    await screen.findByLabelText(/Anything you'd like to add/);
    const padded = screen.UNSAFE_getAllByType(View).some((v) => {
      const style = StyleSheet.flatten(v.props.style) ?? {};
      return style.paddingTop === 47 && style.backgroundColor === colors.bg;
    });
    expect(padded).toBe(true);
  });

  it('pads the hub bottom once, on the bar, so the button clears the home indicator', async () => {
    await AsyncStorage.setItem(SESSIONS_KEY, JSON.stringify([anna]));
    render(<App />);
    fireEvent.press(await screen.findByLabelText('Anna'));
    await screen.findByText('Ready to send');
    const bar = StyleSheet.flatten(screen.getByTestId('hub-action-bar').props.style);
    expect(bar.paddingBottom).toBeGreaterThanOrEqual(34);
    // The frame leaves the bottom to the bar; the top is still padded.
    const frame = screen.UNSAFE_getAllByType(View).map((v) => StyleSheet.flatten(v.props.style) ?? {}).find((st) => st.paddingTop === 47 && st.backgroundColor === colors.bg);
    expect(frame?.paddingBottom).toBe(0);
  });

  it('pads the Ready to send bottom once, on its bar, and the frame leaves the bottom to the bar', async () => {
    await AsyncStorage.setItem(SESSIONS_KEY, JSON.stringify([anna]));
    await AsyncStorage.setItem('gg.contacts.v1', JSON.stringify([{ contactId: 'c1', name: 'Dee', phone: '+15555550100', tier: 'family' }]));
    render(<App />);
    fireEvent.press(await screen.findByLabelText('Anna', {}, { timeout: 10000 }));
    fireEvent.press(await screen.findByRole('button', { name: /Next/ }));
    fireEvent.press(await screen.findByText('Continue'));
    fireEvent.press(await screen.findByText('Dee'));
    fireEvent.press(screen.getByText('Continue'));
    await screen.findByText('Text 1 person');
    const bar = StyleSheet.flatten(screen.getByTestId('ready-action-bar').props.style);
    expect(bar.paddingBottom).toBeGreaterThanOrEqual(34);
    const frame = screen.UNSAFE_getAllByType(View).map((v) => StyleSheet.flatten(v.props.style) ?? {}).find((st) => st.paddingTop === 47 && st.backgroundColor === colors.bg);
    expect(frame?.paddingBottom).toBe(0);
  });

  it('still pads every other screen by the bottom inset', async () => {
    await AsyncStorage.setItem(SESSIONS_KEY, JSON.stringify([anna]));
    render(<App />);
    await screen.findByLabelText('Anna');
    const padded = screen.UNSAFE_getAllByType(View).some((v) => {
      const style = StyleSheet.flatten(v.props.style) ?? {};
      return style.paddingTop === 47 && style.paddingBottom === 34 && style.backgroundColor === colors.bg;
    });
    expect(padded).toBe(true);
  });

  it('pads the Sending bottom once, on its bar, and the frame leaves the bottom to the bar', async () => {
    jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    await AsyncStorage.setItem(SESSIONS_KEY, JSON.stringify([anna]));
    await AsyncStorage.setItem('gg.contacts.v1', JSON.stringify([{ contactId: 'c1', name: 'Dee', phone: '+15555550100', tier: 'family' }]));
    render(<App />);
    fireEvent.press(await screen.findByLabelText('Anna', {}, { timeout: 10000 }));
    fireEvent.press(await screen.findByRole('button', { name: /Next/ }));
    fireEvent.press(await screen.findByText('Continue'));
    fireEvent.press(await screen.findByText('Dee'));
    fireEvent.press(screen.getByText('Continue'));
    fireEvent.press(await screen.findByText(/^Text \d (person|people)$/));
    await screen.findByText('Text Dee');
    const bar = StyleSheet.flatten(screen.getByTestId('sending-action-bar').props.style);
    expect(bar.paddingBottom).toBeGreaterThanOrEqual(34);
    const frame = screen.UNSAFE_getAllByType(View).map((v) => StyleSheet.flatten(v.props.style) ?? {}).find((st) => st.paddingTop === 47 && st.backgroundColor === colors.bg);
    expect(frame?.paddingBottom).toBe(0);
  });
});
