import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { AccessibilityInfo, BackHandler, Linking } from 'react-native';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { freshDraft } from '@griever/hooks';
import type { Session } from '@griever/hooks';
import { App } from './App';
import { SESSIONS_KEY } from '../lib/useDeviceSessions';

// Arriving on a moment opens Ready to send, never the people list. This presses the button that opens the list
// ("Choose who to tell", or "Change who gets this" when people are already picked) and waits for its heading.
const openPeople = async () => {
  fireEvent.press(await screen.findByRole('button', { name: /^(Choose who to tell|Change who gets this)/ }));
  return screen.findByRole('heading', { name: 'Who should get this?' });
};

const anna = {
  id: 'a', flowId: 'flow-a', ownerId: null, role: 'owner', personName: 'Anna', dateOfPassing: '', senderName: '', obituaryUrl: '', announcementMessage: 'Anna passed away peacefully.', serviceMessage: 'Come as you are.', thanksMessage: 'Thank you for being there.',
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

// A tap this soon after opening Messages is ignored (the double-tap guard), so a test waits like a person would.
// The test moves a clock by hand instead of waiting.
let clock = 1_700_000_000_000;
const afterMessages = async () => {
  clock += 1500;
};

beforeEach(() => {
  clock = 1_700_000_000_000;
  jest.spyOn(Date, 'now').mockImplementation(() => clock);
});

const NOTE = 'She was peaceful at home.';

const toSending = async (pick: string[], note = '', told: string[] = []) => {
  jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
  jest.spyOn(AccessibilityInfo, 'announceForAccessibilityWithOptions').mockImplementation(() => undefined);
  // The note is on a draft resumed with no edited wording: a fresh form with web wording starts from that wording
  // and has no Details row to type it in (#824: with no web wording the phone shows the nudge instead).
  const noteDraft = {
    step: 'contacts', templateCategory: 'announcement', templateOverrideId: null,
    fields: { personalNote: note }, serviceDetailsKnown: null, selectedContactIds: [],
    includeFlowers: false, customFlorist: '', flowerDeliveryTarget: 'service', tone: 'plain', messageOverride: null,
  };
  const withNote = note ? { ...anna, drafts: { announcement: noteDraft } } : anna;
  const seeded = told.length > 0 ? { ...withNote, recipientsNotified: { announcement: told } } : withNote;
  await AsyncStorage.setItem(SESSIONS_KEY, JSON.stringify([seeded]));
  await AsyncStorage.setItem('gg.contacts.v1', JSON.stringify(contacts));
  render(<App />);
  fireEvent.press(await screen.findByLabelText('Anna', {}, { timeout: 10000 }));
  // A moment already sent to people shows its compact done row; a new one is the lit card.
  fireEvent.press(told.length > 0 ? await screen.findByRole('button', { name: /^Announce the passing, .*, Sent$/ }) : await screen.findByTestId('hub-next-card'));
  await openPeople();
  for (const name of pick) {
    fireEvent.press(await screen.findByText(name));
  }
  fireEvent.press(screen.getByText(/^Done/));
  fireEvent.press(await screen.findByText(/^Text \d (person|people)$/));
};

describe('recording who was messaged (#621)', () => {
  it('records the two sent ids, not the skipped one, and the hub shows the row in progress after a partial send', async () => {
    await toSending(['Dee', 'Eli', 'Fay'], NOTE);
    // The composed message really carries the note, so the check below means something.
    expect(await screen.findByText(new RegExp(NOTE))).toBeTruthy();
    fireEvent.press(await screen.findByText('Text Dee'));
    await afterMessages();
    fireEvent.press(await screen.findByText('Next'));
    fireEvent.press(await screen.findByText('Skip Eli'));
    fireEvent.press(await screen.findByText('Text Fay'));
    await afterMessages();
    fireEvent.press(await screen.findByText('Done'));
    expect(await screen.findByRole('button', { name: /^Announce the passing.*, In progress, Continue$/ })).toBeTruthy();
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
    fireEvent.press(await screen.findByText('Skip Dee'));
    fireEvent.press(await screen.findByText('Skip Eli'));
    expect(await screen.findByText('No one was texted this time.')).toBeTruthy();
    const saved = await savedAnna();
    expect(saved.recipientsNotified).toEqual({});
    expect(saved.momentCompletedAt).toEqual({});
    expect(screen.queryByRole('button', { name: /^Announce the passing, .*, Sent$/ })).toBeNull();
  });

  it('opens the flow again from the done row, without bouncing back to the hub', async () => {
    await toSending(['Dee']);
    fireEvent.press(await screen.findByText('Text Dee'));
    await afterMessages();
    fireEvent.press(await screen.findByText('Done'));
    expect(await screen.findByRole('button', { name: /^Announce the passing, .*, Sent$/ })).toBeTruthy();
    // Start the announcement again from its done row.
    fireEvent.press(screen.getByRole('button', { name: /^Announce the passing, .*, Sent$/ }));
    // It opens on Ready to send, with the people sheet closed, and stays there.
    expect(await screen.findByRole('button', { name: /^(Choose who to tell|Change who gets this)/ })).toBeTruthy();
    await new Promise((r) => setTimeout(r, 300));
    expect(screen.getByRole('button', { name: /^(Choose who to tell|Change who gets this)/ })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Who should get this?' })).toBeNull();
  });

  it('writes each person to the phone when confirmed, before the send ends', async () => {
    await toSending(['Dee', 'Eli', 'Fay']);
    fireEvent.press(await screen.findByText('Text Dee'));
    await afterMessages();
    fireEvent.press(await screen.findByText('Next'));
    fireEvent.press(await screen.findByText('Text Eli'));
    // Still on the send screen, two people to go: Dee is already kept.
    await waitFor(async () => {
      expect((await savedAnna()).recipientsNotified.announcement).toEqual(['c1']);
    });
    // The record holds contact ids only, and the live send job is not stored (C2).
    const raw = (await AsyncStorage.getItem(SESSIONS_KEY)) ?? '';
    expect(raw).not.toContain('sendJob');
    const saved = await savedAnna();
    expect(saved.recipientsNotified).toEqual({ announcement: ['c1'] });
    expect(saved.recipientsNotified.announcement?.every((value) => /^c\d$/.test(value))).toBe(true);
  });

  it('records the right two people after two Next taps in a row', async () => {
    await toSending(['Dee', 'Eli', 'Fay']);
    fireEvent.press(await screen.findByText('Text Dee'));
    await afterMessages();
    fireEvent.press(await screen.findByText('Next'));
    fireEvent.press(await screen.findByText('Text Eli'));
    await afterMessages();
    fireEvent.press(await screen.findByText('Next'));
    await screen.findByText('Text Fay');
    await waitFor(async () => {
      expect((await savedAnna()).recipientsNotified.announcement).toEqual(['c1', 'c2']);
    });
  });

  it('Android Back mid-send, then reopening the moment, selects only the people not yet told', async () => {
    const handlers: (() => boolean)[] = [];
    jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_e, h) => {
      handlers.push(h as () => boolean);
      return { remove: () => void handlers.splice(handlers.indexOf(h as () => boolean), 1) };
    });
    await toSending(['Dee', 'Eli', 'Fay']);
    fireEvent.press(await screen.findByText('Text Dee'));
    await afterMessages();
    fireEvent.press(await screen.findByText('Next'));
    await screen.findByText('Text Eli');
    act(() => void [...handlers].reverse().some((h) => h()));
    fireEvent.press(await screen.findByRole('button', { name: /^Announce the passing, .*, Sent$/ }));
    // The flow reopens on review with Eli and Fay, not all three and not a blank form.
    expect(await screen.findByText('Text 2 people')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Who should get this?' })).toBeNull();
    expect(screen.queryByLabelText(/Anything you'd like to add/)).toBeNull();
  });

  describe('a send stopped mid-way and reopened after a force-quit', () => {
    const midSend = async (toldIds: string[]) => {
      const draft = { ...freshDraft({}), templateCategory: 'announcement' as const, step: 'sending' as const, selectedContactIds: ['c1', 'c2', 'c3'], toldIds };
      await AsyncStorage.setItem(SESSIONS_KEY, JSON.stringify([{ ...anna, drafts: { announcement: draft }, recipientsNotified: { announcement: toldIds } }]));
      await AsyncStorage.setItem('gg.contacts.v1', JSON.stringify(contacts));
      render(<App />);
      fireEvent.press(await screen.findByLabelText('Anna', {}, { timeout: 10000 }));
      fireEvent.press(await screen.findByRole('button', { name: /^Announce the passing.*(Sent|In progress)$/ }));
    };

    it('opens on Ready to send without the people already told, and the sheet closed', async () => {
      await midSend(['c1']);
      expect(await screen.findByText('Text 2 people')).toBeTruthy();
      expect(screen.queryByRole('heading', { name: 'Who should get this?' })).toBeNull();
    });

    it('opens with nobody picked and "Choose who to tell" when everyone was told', async () => {
      await midSend(['c1', 'c2', 'c3']);
      expect(await screen.findByRole('button', { name: 'Choose who to tell' })).toBeTruthy();
      await act(async () => new Promise((r) => setTimeout(r, 300)));
      expect(screen.queryByRole('heading', { name: 'Who should get this?' })).toBeNull();
    });
  });

  it('Android Back on the send screen goes to the hub and keeps who was told', async () => {
    const handlers: (() => boolean)[] = [];
    jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_e, h) => {
      handlers.push(h as () => boolean);
      return { remove: () => void handlers.splice(handlers.indexOf(h as () => boolean), 1) };
    });
    await toSending(['Dee', 'Eli']);
    fireEvent.press(await screen.findByText('Text Dee'));
    await afterMessages();
    fireEvent.press(await screen.findByText('Next'));
    await screen.findByText('Text Eli');
    act(() => void [...handlers].reverse().some((h) => h()));
    expect(await screen.findByText('Ready to send')).toBeTruthy();
    expect(await screen.findByRole('button', { name: /^Announce the passing, .*, Sent$/ })).toBeTruthy();
    expect((await savedAnna()).recipientsNotified.announcement).toEqual(['c1']);
  });

  it('Stop for now ends the send, keeps who was told, and the hub says how many', async () => {
    await toSending(['Dee', 'Eli', 'Fay']);
    fireEvent.press(await screen.findByText('Text Dee'));
    await afterMessages();
    fireEvent.press(await screen.findByText('Next'));
    fireEvent.press(await screen.findByText('Stop for now'));
    expect(await screen.findByText('You told 1 of 3.')).toBeTruthy();
    // The stopped card is the lit card and shows progress; leaving the person screen clears this.
    expect((await screen.findAllByRole('button', { name: /^Announce the passing.*, In progress, Continue$/ })).length).toBe(1);
    expect(screen.getAllByTestId('hub-next-card')).toHaveLength(1);
    expect((await savedAnna()).recipientsNotified.announcement).toEqual(['c1']);
  });

  it('a re-send to people told before still reaches those not yet confirmed in this send', async () => {
    const handlers: (() => boolean)[] = [];
    jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_e, h) => {
      handlers.push(h as () => boolean);
      return { remove: () => void handlers.splice(handlers.indexOf(h as () => boolean), 1) };
    });
    // All three were told by an earlier send. A new send goes to the same three.
    await toSending(['Dee', 'Eli', 'Fay'], '', ['c1', 'c2', 'c3']);
    fireEvent.press(await screen.findByText('Text Dee'));
    await afterMessages();
    fireEvent.press(await screen.findByText('Next'));
    await screen.findByText('Text Eli');
    act(() => void [...handlers].reverse().some((h) => h()));
    fireEvent.press(await screen.findByRole('button', { name: /^Announce the passing, .*, Sent$/ }));
    // Only Dee was confirmed in this send, so Eli and Fay are offered again.
    expect(await screen.findByText('Text 2 people')).toBeTruthy();
  });
});
