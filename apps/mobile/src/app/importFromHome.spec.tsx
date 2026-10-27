import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { AccessibilityInfo } from 'react-native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { App } from './App';
import { SESSIONS_KEY, ACTIVE_KEY } from '../lib/useDeviceSessions';

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
    const last = focus.mock.calls[focus.mock.calls.length - 1][0] as number;
    const focused = textUnder(mockNodes[last - 1]);
    expect(focused).toContain('Add from your contacts');
    expect(focused).not.toContain('Your account');
  });

  it('focus returns once only: after opening a person and coming Home it is not on the import button', async () => {
    await AsyncStorage.setItem(SESSIONS_KEY, JSON.stringify([anna]));
    await AsyncStorage.setItem(ACTIVE_KEY, 'a');
    mockFetch.mockResolvedValue([{ key: 'x', displayName: 'Sam', phones: ['+16175550111'], emails: [] }]);
    const focus = jest.spyOn(AccessibilityInfo, 'setAccessibilityFocus').mockImplementation(() => undefined);
    render(<App />);
    fireEvent.press(await screen.findByRole('button', { name: 'Add from your contacts' }));
    await screen.findByText('Sam');
    fireEvent.press(screen.getByRole('button', { name: 'Back' }));
    await screen.findByText("Who you're writing about");
    await waitFor(() => expect(focus).toHaveBeenCalled());
    fireEvent.press(screen.getByRole('button', { name: 'Anna' }));
    await screen.findByText('One thing at a time.');
    focus.mockClear();
    fireEvent.press(await screen.findByRole('button', { name: 'Back' }));
    await screen.findByText("Who you're writing about");
    await new Promise((resolve) => setTimeout(resolve, 50));
    const calls = focus.mock.calls.map((c) => textUnder(mockNodes[(c[0] as number) - 1]));
    expect(calls.some((t) => t.includes('Add from your contacts'))).toBe(false);
  });
});
