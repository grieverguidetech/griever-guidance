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

// Records the options each stack gets, so a test can see the navigators use screenTransition.
const mockScreenOptions: Record<string, unknown>[] = [];
jest.mock('../lib/expoContactsSource', () => ({
  expoContactsSource: {
    id: 'native',
    preselected: false,
    isAvailable: () => Promise.resolve(true),
    fetch: () => Promise.resolve([{ key: 'x', displayName: 'Starred Sam', phones: ['+16175550111'], emails: [] }]),
  },
}));
jest.mock('@react-navigation/native-stack', () => {
  const actual = jest.requireActual<typeof import('@react-navigation/native-stack')>('@react-navigation/native-stack');
  const React = jest.requireActual<typeof import('react')>('react');
  return {
    ...actual,
    createNativeStackNavigator: (...args: Parameters<typeof actual.createNativeStackNavigator>) => {
      const stack = actual.createNativeStackNavigator(...args);
      const Navigator = (props: { screenOptions?: Record<string, unknown> }) => {
        mockScreenOptions.push(props.screenOptions ?? {});
        return React.createElement(stack.Navigator as never, props as never);
      };
      return { ...stack, Navigator };
    },
  };
});

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
  fireEvent.press(await screen.findByRole('button', { name: /Next/ }));
};

afterEach(() => {
  jest.restoreAllMocks();
});

describe('Android Back inside the flow (#653)', () => {
  it('on Ready to send steps back to the person screen, as the on-screen Back does', async () => {
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
    await screen.findByRole('heading', { name: 'Announce the passing' });
    act(() => void pressBack());
    expect(await screen.findByRole('heading', { name: 'Ready to send' })).toBeTruthy();
    expect(screen.queryByText('Who should know?')).toBeNull();
    expect(screen.queryByText("Who you're writing about")).toBeNull();
  });
});

describe('Android Back in the import review (#653)', () => {
  it('steps back to the list, as the on-screen Back does, and is released outside the review', async () => {
    const handlers: (() => boolean)[] = [];
    jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_e, h) => {
      handlers.push(h as () => boolean);
      return { remove: () => void handlers.splice(handlers.indexOf(h as () => boolean), 1) };
    });
    const pressBack = () => [...handlers].reverse().some((h) => h());
    await startAnnouncement(true);
    fireEvent.press(await screen.findByText('Continue'));
    await screen.findByRole('heading', { name: 'Who should know?' });
    fireEvent.press(screen.getByRole('button', { name: 'Add from your contacts' }));
    await screen.findByRole('heading', { name: 'Add from your contacts' });
    const handled = jest.fn();
    act(() => handled(pressBack()));
    expect(handled).toHaveBeenCalledWith(true);
    expect(await screen.findByRole('heading', { name: 'Who should know?' })).toBeTruthy();
    expect(screen.queryByText('Starred Sam')).toBeNull();
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
  it('moves to the heading on Ready to send and on the picker', async () => {
    const focus = jest.spyOn(AccessibilityInfo, 'setAccessibilityFocus').mockImplementation(() => undefined);
    await startAnnouncement(true);
    fireEvent.press(await screen.findByText('Continue'));
    await screen.findByRole('heading', { name: 'Who should know?' });
    expect(focus).toHaveBeenCalled();
    fireEvent.press(await screen.findByText('Dee'));
    focus.mockClear();
    fireEvent.press(screen.getByText('Continue'));
    await screen.findByRole('heading', { name: 'Announce the passing' });
    expect(focus).toHaveBeenCalledTimes(1);
  });
});

describe('The stacks use the calm transition (#653)', () => {
  const lastOptions = () => mockScreenOptions[mockScreenOptions.length - 1];
  const settle = async () => {
    await startAnnouncement(true);
    await screen.findByLabelText(/Anything you'd like to add/);
    await act(async () => undefined);
  };

  it('fades with no screen reader and no Reduce Motion', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
    jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockResolvedValue(false);
    await settle();
    expect(lastOptions()).toMatchObject({ animation: 'fade', animationDuration: 200 });
  });

  it('has no animation with Reduce Motion on', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
    jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockResolvedValue(false);
    await settle();
    expect(lastOptions()).toMatchObject({ animation: 'none' });
  });

  it('has no animation with a screen reader on', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
    jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockResolvedValue(true);
    await settle();
    expect(lastOptions()).toMatchObject({ animation: 'none' });
  });
});
