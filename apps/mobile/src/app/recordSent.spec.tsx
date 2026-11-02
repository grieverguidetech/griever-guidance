import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { AccessibilityInfo, Linking } from 'react-native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Session } from '@griever/hooks';
import { App } from './App';
import { SESSIONS_KEY } from '../lib/useDeviceSessions';

const anna = {
  id: 'a', flowId: 'flow-a', ownerId: null, role: 'owner', personName: 'Anna', dateOfPassing: '', senderName: '', obituaryUrl: '',
  createdAt: '2026-10-01T00:00:00.000Z', lastOpenedAt: '2026-10-01T00:00:00.000Z',
  drafts: {}, serviceReady: false, recipientsNotified: {}, momentCompletedAt: {}, remindersScheduled: [],
} as unknown as Session;

const contacts = [
  { contactId: 'c1', name: 'Dee', phone: '+15555550100', tier: 'family' },
  { contactId: 'c2', name: 'Eli', phone: '+15555550101', tier: 'family' },
  { contactId: 'c3', name: 'Fay', phone: '+15555550102', tier: 'family' },
];

afterEach(() => {
  jest.restoreAllMocks();
});

const savedAnna = async (): Promise<Session> => {
  const list = JSON.parse((await AsyncStorage.getItem(SESSIONS_KEY)) ?? '[]') as Session[];
  return list.find((s) => s.id === 'a') as Session;
};

const NOTE = 'She was peaceful at home.';

const toSending = async (pick: string[], note = '') => {
  jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
  jest.spyOn(AccessibilityInfo, 'announceForAccessibilityWithOptions').mockImplementation(() => undefined);
  await AsyncStorage.setItem(SESSIONS_KEY, JSON.stringify([anna]));
  await AsyncStorage.setItem('gg.contacts.v1', JSON.stringify(contacts));
  render(<App />);
  fireEvent.press(await screen.findByLabelText('Anna', {}, { timeout: 10000 }));
  fireEvent.press(await screen.findByRole('button', { name: 'Start' }));
  if (note) {
    fireEvent.changeText(await screen.findByLabelText(/Anything you'd like to add/), note);
  }
  fireEvent.press(await screen.findByText('Continue'));
  for (const name of pick) {
    fireEvent.press(await screen.findByText(name));
  }
  fireEvent.press(screen.getByText('Continue'));
  fireEvent.press(await screen.findByText(/^Text \d (person|people)$/));
};

describe('recording who was messaged (#621)', () => {
  it('records the two sent ids, not the skipped one, and the hub shows the row done', async () => {
    await toSending(['Dee', 'Eli', 'Fay'], NOTE);
    // The composed message really carries the note, so the check below means something.
    expect(await screen.findByText(new RegExp(NOTE))).toBeTruthy();
    fireEvent.press(await screen.findByText('Open Messages'));
    fireEvent.press(await screen.findByText('Next'));
    fireEvent.press(await screen.findByText('Skip'));
    fireEvent.press(await screen.findByText('Open Messages'));
    fireEvent.press(await screen.findByText('Done'));
    expect(await screen.findByText(/^2 people · /)).toBeTruthy();
    await waitFor(async () => {
      const saved = await savedAnna();
      expect(saved.recipientsNotified.announcement).toEqual(['c1', 'c3']);
      expect(saved.momentCompletedAt.announce).toEqual(expect.any(String));
    });
    // C2: the finished send keeps no wording. The draft is empty and the raw store has no message text.
    const draft = (await savedAnna()).drafts.announcement;
    expect(draft?.messageOverride ?? null).toBeNull();
    expect(draft?.fields ?? {}).toEqual({});
    expect(await AsyncStorage.getItem(SESSIONS_KEY)).not.toContain(NOTE);
  });

  it('records nothing when everyone is skipped, and the row is not done', async () => {
    await toSending(['Dee', 'Eli']);
    fireEvent.press(await screen.findByText('Skip'));
    fireEvent.press(await screen.findByText('Skip'));
    expect(await screen.findByText('No one was texted this time.')).toBeTruthy();
    const saved = await savedAnna();
    expect(saved.recipientsNotified).toEqual({});
    expect(saved.momentCompletedAt).toEqual({});
    expect(screen.queryByText(/^\d+ (person|people) · /)).toBeNull();
  });

  it('opens the flow again from the done row, without bouncing back to the hub', async () => {
    await toSending(['Dee']);
    fireEvent.press(await screen.findByText('Open Messages'));
    fireEvent.press(await screen.findByText('Done'));
    expect(await screen.findByText(/^1 person · /)).toBeTruthy();
    // Start the announcement again from its done row.
    fireEvent.press(screen.getByText(/^1 person · /));
    expect(await screen.findByLabelText(/Anything you'd like to add/)).toBeTruthy();
    await new Promise((r) => setTimeout(r, 300));
    expect(screen.getByLabelText(/Anything you'd like to add/)).toBeTruthy();
    expect(screen.queryByText('One thing at a time.')).toBeNull();
  });
});
