import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { AccessibilityInfo, BackHandler } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Session } from '@griever/hooks';
import { App } from './App';
import { SESSIONS_KEY } from '../lib/useDeviceSessions';

// Jest has no native view tree, so findNodeHandle returns null. A fake handle lets the test see focus sent.
const mockHandles = new Map<unknown, number>();
jest.mock('react-native/Libraries/ReactNative/RendererProxy', () => ({
  ...jest.requireActual<object>('react-native/Libraries/ReactNative/RendererProxy'),
  findNodeHandle: (node: unknown) => {
    if (!node) {
      return null;
    }
    if (!mockHandles.has(node)) {
      mockHandles.set(node, mockHandles.size + 1);
    }
    return mockHandles.get(node);
  },
}));

const anna = {
  id: 'a', flowId: 'flow-a', ownerId: null, role: 'owner', personName: 'Anna', dateOfPassing: '', senderName: '', obituaryUrl: '',
  createdAt: '2026-10-01T00:00:00.000Z', lastOpenedAt: '2026-10-01T00:00:00.000Z',
  drafts: {}, serviceReady: false, recipientsNotified: {}, momentCompletedAt: {}, remindersScheduled: [],
} as unknown as Session;

const dee = { contactId: 'c1', name: 'Dee', phone: '+15555550100', tier: 'family' };

const startAnnouncement = async (withContacts: boolean) => {
  await AsyncStorage.setItem(SESSIONS_KEY, JSON.stringify([anna]));
  if (withContacts) {
    await AsyncStorage.setItem('gg.contacts.v1', JSON.stringify([dee]));
  }
  render(<App />);
  fireEvent.press(await screen.findByLabelText('Anna'));
  fireEvent.press(await screen.findByRole('button', { name: 'Start' }));
};

afterEach(() => {
  jest.restoreAllMocks();
});

describe('Android Back inside the flow (#653)', () => {
  it('on Review steps back to Who should know?, as the on-screen Back does', async () => {
    const handlers: (() => boolean)[] = [];
    jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_e, h) => {
      handlers.push(h as () => boolean);
      return { remove: () => void handlers.splice(handlers.indexOf(h as () => boolean), 1) };
    });
    const pressBack = () => [...handlers].reverse().some((h) => h());
    await startAnnouncement(true);
    fireEvent.press(await screen.findByText('Continue'));
    fireEvent.press(await screen.findByText('Dee'));
    fireEvent.press(screen.getByText('Continue'));
    await screen.findByRole('heading', { name: 'Read it once before it goes' });
    act(() => void pressBack());
    expect(await screen.findByRole('heading', { name: 'Who should know?' })).toBeTruthy();
    expect(screen.queryByText("Who you're writing about")).toBeNull();
  });
});

describe('Edit from a step (#653)', () => {
  it('reads "Edit their details", and Continue returns to the step with no contacts check', async () => {
    // No saved contacts: the old Continue went on to the contacts step.
    await startAnnouncement(false);
    await screen.findByLabelText(/Anything you'd like to add/);
    fireEvent.press(screen.getByRole('button', { name: 'Edit' }));
    expect(await screen.findByRole('heading', { name: 'Edit their details' })).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByLabelText(/Anything you'd like to add/)).toBeTruthy();
    expect(screen.queryByText("Who you're writing about")).toBeNull();
  });
});

describe('Focus on arrival (#653)', () => {
  it('moves to the heading on Confirm and on the picker', async () => {
    const focus = jest.spyOn(AccessibilityInfo, 'setAccessibilityFocus').mockImplementation(() => undefined);
    await startAnnouncement(true);
    fireEvent.press(await screen.findByText('Continue'));
    await screen.findByRole('heading', { name: 'Who should know?' });
    expect(focus).toHaveBeenCalled();
    fireEvent.press(await screen.findByText('Dee'));
    focus.mockClear();
    fireEvent.press(screen.getByText('Continue'));
    await screen.findByRole('heading', { name: 'Read it once before it goes' });
    expect(focus).toHaveBeenCalledTimes(1);
  });
});
