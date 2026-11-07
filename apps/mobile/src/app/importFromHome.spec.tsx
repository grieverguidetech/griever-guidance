import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { AccessibilityInfo } from 'react-native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { App } from './App';
import { ACTIVE_KEY, SESSIONS_KEY } from '../lib/useDeviceSessions';

// Jest has no native view tree, so findNodeHandle returns null. This gives each node its own handle,
// so a test can see which button focus went to.
const mockNodes: unknown[] = [];
jest.mock('react-native/Libraries/ReactNative/RendererProxy', () => ({
  ...jest.requireActual<object>('react-native/Libraries/ReactNative/RendererProxy'),
  findNodeHandle: (node: unknown) => {
    let at = mockNodes.indexOf(node);
    if (at < 0) {
      mockNodes.push(node);
      at = mockNodes.length - 1;
    }
    return at + 1;
  },
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

type Fiber = { memoizedProps?: { children?: unknown }; child?: Fiber | null; sibling?: Fiber | null };

// The text a focused node shows, read from its React fiber (the nodes are test doubles with no label).
const textUnder = (node: unknown): string => {
  const walk = (fiber: Fiber | null | undefined): string => {
    if (!fiber) {
      return '';
    }
    const own = typeof fiber.memoizedProps?.children === 'string' ? fiber.memoizedProps.children : '';
    return own + walk(fiber.child) + walk(fiber.sibling);
  };
  return walk((node as { _reactInternals: Fiber })._reactInternals.child);
};

afterEach(() => {
  jest.restoreAllMocks();
  mockFetch.mockReset();
});

describe('Import contacts from Home (#379)', () => {
  it('Home, Add from your contacts, import review, Back to Home with focus on the button', async () => {
    await AsyncStorage.setItem(SESSIONS_KEY, JSON.stringify([anna]));
    mockFetch.mockResolvedValue([{ key: 'x', displayName: 'Sam', phones: ['+16175550111'], emails: [] }]);
    const focus = jest.spyOn(AccessibilityInfo, 'setAccessibilityFocus').mockImplementation(() => undefined);
    render(<App />);
    fireEvent.press(await screen.findByRole('button', { name: 'Add from your contacts' }));
    expect(await screen.findByText('Sam')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Back' }));
    expect(await screen.findByText("Who you're writing about")).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Add from your contacts' })).toBeTruthy();
    await waitFor(() => expect(focus).toHaveBeenCalled());
    const last = focus.mock.calls[focus.mock.calls.length - 1][0] as number;
    const focused = textUnder(mockNodes[last - 1]);
    expect(focused).toContain('Add from your contacts');
    expect(focused).not.toContain('Your account');
  });

  it('the person screen has no More and no Add from your contacts (the people sheet imports)', async () => {
    await AsyncStorage.setItem(SESSIONS_KEY, JSON.stringify([anna]));
    await AsyncStorage.setItem(ACTIVE_KEY, 'a');
    render(<App />);
    await screen.findByText('Ready to send');
    expect(screen.queryByRole('button', { name: 'More' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Add from your contacts' })).toBeNull();
    expect(screen.queryByText('Add from your contacts')).toBeNull();
  });
});
