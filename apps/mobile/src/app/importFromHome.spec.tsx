import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { AccessibilityInfo } from 'react-native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { App } from './App';
import { SESSIONS_KEY, ACTIVE_KEY } from '../lib/useDeviceSessions';

// Jest has no native view tree, so findNodeHandle returns null. A fake handle lets the test see focus sent.
jest.mock('react-native/Libraries/ReactNative/RendererProxy', () => ({
  ...jest.requireActual<object>('react-native/Libraries/ReactNative/RendererProxy'),
  findNodeHandle: () => 1,
}));

const mockFetch = jest.fn<() => Promise<unknown[]>>();
jest.mock('../lib/expoContactsSource', () => ({
  expoContactsSource: { id: 'native', preselected: false, isAvailable: async () => true, fetch: () => mockFetch() },
}));

const anna = {
  id: 'a', flowId: 'flow-a', ownerId: null, role: 'owner', personName: 'Anna', dateOfPassing: '', senderName: '',
  obituaryUrl: '', createdAt: '2026-10-01T00:00:00.000Z', lastOpenedAt: '2026-10-01T00:00:00.000Z',
  drafts: {}, serviceReady: false, recipientsNotified: {}, momentCompletedAt: {}, remindersScheduled: [],
};

afterEach(() => {
  jest.restoreAllMocks();
  mockFetch.mockReset();
});

describe('Import contacts from Home (#379)', () => {
  it('Home, Add from your contacts, import review, Back to Home with focus on the button', async () => {
    await AsyncStorage.setItem(SESSIONS_KEY, JSON.stringify([anna]));
    await AsyncStorage.setItem(ACTIVE_KEY, 'a');
    mockFetch.mockResolvedValue([{ key: 'x', displayName: 'Sam', phones: ['+16175550111'], emails: [] }]);
    const focus = jest.spyOn(AccessibilityInfo, 'setAccessibilityFocus').mockImplementation(() => undefined);
    render(<App />);
    fireEvent.press(await screen.findByRole('button', { name: 'Add from your contacts' }));
    expect(await screen.findByText('Sam')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Back' }));
    expect(await screen.findByText("Who you're writing about")).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Add from your contacts' })).toBeTruthy();
    await waitFor(() => expect(focus).toHaveBeenCalled());
  });
});
