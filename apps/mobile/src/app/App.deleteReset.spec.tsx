import { describe, expect, it } from '@jest/globals';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { App } from './App';
import { announceLocalDataReset } from '../lib/deleteLocalData';

const anna = {
  id: 'a', flowId: 'flow-a', ownerId: null, role: 'owner', personName: 'Anna', dateOfPassing: '', senderName: '', obituaryUrl: '',
  createdAt: '2026-10-01T00:00:00.000Z', lastOpenedAt: '2026-10-01T00:00:00.000Z', drafts: {}, serviceReady: false,
  recipientsNotified: {}, momentCompletedAt: {}, remindersScheduled: [],
};

describe('after the account is deleted (#719)', () => {
  it('drops the people held in memory, and nothing old is written back to the phone', async () => {
    await AsyncStorage.setItem('gg.sessions.v1', JSON.stringify([anna]));
    render(<App />);
    fireEvent.press(await screen.findByLabelText('Anna'));
    await screen.findByText('Ready to send');
    // What deleteLocalData does to storage, then the announcement the deleted screen's button makes.
    await AsyncStorage.clear();
    act(() => announceLocalDataReset());
    expect(await screen.findByText("Start with someone I've lost")).toBeTruthy();
    expect(screen.queryByLabelText('Anna')).toBeNull();
    expect(screen.queryByText('Ready to send')).toBeNull();
    fireEvent.press(screen.getByText("Start with someone I've lost"));
    await screen.findByText('Who are we writing about?');
    const saved = (await AsyncStorage.getItem('gg.sessions.v1')) ?? '';
    expect(saved).not.toContain('Anna');
  });
});
