import { Modal } from 'react-native';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { screenCopy } from '@griever/copy';
import { CHECKLIST_PHASES } from '@griever/shared';
import type { ChecklistItemId } from '@griever/shared';
import { App } from './App';
import { ACTIVE_KEY, SESSIONS_KEY } from '../lib/useDeviceSessions';

const phrases = screenCopy('cmsChecklist');
const RIGHT_AWAY = phrases.phases['right-away'];
const first = (CHECKLIST_PHASES.find((phase) => phase.key === 'right-away')?.itemIds ?? [])[0] as ChecklistItemId;

const anna = {
  id: 'a', flowId: 'flow-a', ownerId: null, role: 'owner', personName: 'Anna', dateOfPassing: '', senderName: '', obituaryUrl: '',
  createdAt: '2026-10-01T00:00:00.000Z', lastOpenedAt: '2026-10-01T00:00:00.000Z', drafts: {}, serviceReady: false,
  recipientsNotified: {}, momentCompletedAt: {}, remindersScheduled: [],
};

const ben = { ...anna, id: 'b', flowId: 'flow-b', personName: 'Ben', createdAt: '2026-10-03T00:00:00.000Z', lastOpenedAt: '2026-10-03T00:00:00.000Z' };

const storedChecklist = async (id = 'a') => {
  const saved = JSON.parse((await AsyncStorage.getItem(SESSIONS_KEY)) ?? '[]') as { id: string; checklist?: Record<string, string> }[];
  return saved.find((person) => person.id === id)?.checklist;
};

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.setItem(SESSIONS_KEY, JSON.stringify([anna]));
  await AsyncStorage.setItem(ACTIVE_KEY, 'a');
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('What you will need on the person screen (#699)', () => {
  it('opens the sheet, and a tick is saved on the person on this phone', async () => {
    render(<App />);
    await screen.findByText('Ready to send');
    expect(screen.queryByRole('button', { name: 'More' })).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: "What you'll need" }));
    fireEvent.press(await screen.findByRole('button', { name: RIGHT_AWAY }));
    fireEvent.press(await screen.findByRole('checkbox', { name: phrases.items[first] }));
    await waitFor(async () => expect(await storedChecklist()).toEqual({ [first]: 'done' }));
  });

  it('keeps the tick: closing and opening the sheet again shows it ticked', async () => {
    render(<App />);
    await screen.findByText('Ready to send');
    fireEvent.press(screen.getByRole('button', { name: "What you'll need" }));
    fireEvent.press(await screen.findByRole('button', { name: RIGHT_AWAY }));
    fireEvent.press(await screen.findByRole('checkbox', { name: phrases.items[first] }));
    fireEvent.press(screen.getByRole('button', { name: 'Close' }));
    await act(async () => {});
    fireEvent.press(screen.getByRole('button', { name: "What you'll need" }));
    fireEvent.press(await screen.findByRole('button', { name: RIGHT_AWAY }));
    const row = await screen.findByRole('checkbox', { name: phrases.items[first] });
    expect(within(row).getByText(phrases.items[first])).toBeTruthy();
    expect(row.props.accessibilityState.checked).toBe(true);
  });

  it('after switching to Ben, a tick is saved on Ben and not on Anna', async () => {
    await AsyncStorage.setItem(SESSIONS_KEY, JSON.stringify([anna, ben]));
    await AsyncStorage.setItem(ACTIVE_KEY, 'a');
    render(<App />);
    await screen.findByText('For Anna');
    fireEvent.press(screen.getByRole('button', { name: 'Writing about Anna' }));
    fireEvent.press(await screen.findByRole('button', { name: 'Ben' }));
    // A sheet's onDismiss does not fire in Jest; the switcher runs the choice from it on iOS.
    act(() => screen.UNSAFE_getAllByType(Modal).forEach((modal) => modal.props.onDismiss?.()));
    await screen.findByText('For Ben');
    fireEvent.press(screen.getByRole('button', { name: "What you'll need" }));
    fireEvent.press(await screen.findByRole('button', { name: RIGHT_AWAY }));
    fireEvent.press(await screen.findByRole('checkbox', { name: phrases.items[first] }));
    await waitFor(async () => expect(await storedChecklist('b')).toEqual({ [first]: 'done' }));
    expect(await storedChecklist('a')).toBeUndefined();
  });
});
