import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { AccessibilityInfo, AppState, Linking } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Session } from '@griever/hooks';
import { App } from './App';
import { SESSIONS_KEY } from '../lib/useDeviceSessions';
import { findMessage, typeMessage } from '../testing/messageBox';

// #1073: open a moment, edit the text, text people, Stop for now, open the same moment again.
// The second open must show Ready to send (never a blank screen), with the starting wording (C2: a
// stopped send keeps no wording). Each test is one way into the Sending screen and out of it.

const WEB_SERVICE = 'The service is at noon.';
const WEB_THANKS = 'Thank you for being there.';

const base = {
  id: 'a', flowId: 'flow-a', ownerId: null, role: 'owner', personName: 'Anna', dateOfPassing: '', senderName: '', obituaryUrl: '',
  announcementMessage: 'Anna passed away peacefully.', serviceType: 'Funeral', serviceMessage: WEB_SERVICE, thanksMessage: WEB_THANKS,
  sectionStatus: { announcement: 'ready', service: 'ready', thanks: 'ready', obituary: 'ready' },
  createdAt: '2026-10-01T00:00:00.000Z', lastOpenedAt: '2026-10-01T00:00:00.000Z',
  drafts: {}, serviceReady: false, recipientsNotified: {}, momentCompletedAt: {}, remindersScheduled: [],
};
const anna = base as unknown as Session;
// "Everyone you told" is picked for the service: the announcement reached Dee and Eli.
const annaTold = { ...base, recipientsNotified: { announcement: ['c1', 'c2'] } } as unknown as Session;

const contacts = [
  { contactId: 'c1', name: 'Dee', phone: '+15555550100', tier: 'family' },
  { contactId: 'c2', name: 'Eli', phone: '+15555550101', tier: 'family' },
];

const PEOPLE_BUTTON = /^(Choose who to tell|Change who you're texting)/;

let clock = 1_700_000_000_000;
let appState: (state: string) => void = () => undefined;
// Coming back from Messages takes a few seconds; the hand-off guard reads this clock.
const fromMessages = () => {
  act(() => appState('background'));
  clock += 3000;
  act(() => appState('active'));
};

beforeEach(() => {
  clock = 1_700_000_000_000;
  jest.spyOn(Date, 'now').mockImplementation(() => clock);
  jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
  jest.spyOn(AccessibilityInfo, 'announceForAccessibilityWithOptions').mockImplementation(() => undefined);
  jest.spyOn(AppState, 'addEventListener').mockImplementation(((_: string, cb: (state: string) => void) => {
    appState = cb;
    return { remove: () => undefined };
  }) as never);
});

afterEach(() => {
  jest.restoreAllMocks();
});

const openHub = async (person: Session) => {
  await AsyncStorage.setItem(SESSIONS_KEY, JSON.stringify([person]));
  await AsyncStorage.setItem('gg.contacts.v1', JSON.stringify(contacts));
  render(<App />);
  fireEvent.press(await screen.findByLabelText('Anna', {}, { timeout: 10000 }));
};

const savedDraft = async (category: 'service' | 'aftercare') => {
  const list = JSON.parse((await AsyncStorage.getItem(SESSIONS_KEY)) ?? '[]') as Session[];
  return list[0]?.drafts[category];
};

// A moment can show as its row and as the lit card; both open the same flow, so the first one is pressed.
const pressRow = async (title: RegExp) => fireEvent.press((await screen.findAllByRole('button', { name: title }))[0]);

// Starts the moment from its hub row, picks people if none are picked, edits the text, and opens the Sending screen.
const toSending = async (title: RegExp, pick: string[]) => {
  await pressRow(title);
  const people = await screen.findByRole('button', { name: PEOPLE_BUTTON });
  if (pick.length > 0) {
    fireEvent.press(people);
    await screen.findByRole('heading', { name: 'Who should get this?' });
    for (const name of pick) {
      fireEvent.press(await screen.findByText(name));
    }
    fireEvent.press(screen.getByText(/^Done/));
  }
  await findMessage(/\w/);
  typeMessage('My own words.');
  fireEvent.press(await screen.findByRole('button', { name: 'Done' }));
  fireEvent.press(await screen.findByText(/^Text \d (person|people)$/));
};

const stopForNow = async () => {
  fireEvent.press(await screen.findByText('Stop for now'));
  await screen.findByText('For Anna');
};

// The reopened moment shows Ready to send (the people button) with the starting wording, and Back still leaves.
const expectReadyToSend = async (words: string) => {
  expect(await screen.findByRole('button', { name: PEOPLE_BUTTON })).toBeTruthy();
  expect(await findMessage(words)).toBeTruthy();
  fireEvent.press(screen.getByRole('button', { name: 'Back' }));
  expect(await screen.findByText('For Anna')).toBeTruthy();
};

describe('opening a moment again after Stop for now (#1073)', () => {
  it('a. Share the service with the told people picked by default', async () => {
    await openHub(annaTold);
    await pressRow(/Share the service/);
    await findMessage(/\w/);
    typeMessage('My own words.');
    fireEvent.press(await screen.findByRole('button', { name: 'Done' }));
    fireEvent.press(await screen.findByText(/^Text 2 people$/));
    await stopForNow();
    expect((await savedDraft('service'))?.step).toBe('sent');
    await pressRow(/Share the service/);
    await expectReadyToSend(WEB_SERVICE);
  });

  it('b. Share the service after the hand-off to Messages and the return', async () => {
    await openHub(anna);
    await toSending(/Share the service/, ['Dee']);
    fireEvent.press(await screen.findByText('Text Dee'));
    expect(Linking.openURL).toHaveBeenCalledTimes(1);
    fromMessages();
    await screen.findByText(/^Sent to Dee\?/);
    await stopForNow();
    await pressRow(/Share the service/);
    await expectReadyToSend(WEB_SERVICE);
  });

  it('c. Share the service with two people, stopping after the first is sent', async () => {
    await openHub(anna);
    await toSending(/Share the service/, ['Dee', 'Eli']);
    fireEvent.press(await screen.findByText('Text Dee'));
    clock += 1500;
    fireEvent.press(await screen.findByText('Next'));
    await screen.findByText('Text Eli');
    await stopForNow();
    expect(await screen.findByText('You told 1 of 2.')).toBeTruthy();
    await pressRow(/Share the service/);
    await expectReadyToSend(WEB_SERVICE);
  });

  it('d. The announcement, stopped and reopened from the lit card on the hub', async () => {
    await openHub(anna);
    await toSending(/^Announce the passing, .*Continue$/, ['Dee']);
    await stopForNow();
    const cards = screen.getAllByTestId('hub-next-card');
    expect(cards).toHaveLength(1);
    fireEvent.press(cards[0]);
    await expectReadyToSend('Anna passed away peacefully.');
  });

  it('e. Send thank-yous after Stop for now', async () => {
    await openHub(anna);
    await toSending(/Send thank-yous/, ['Dee']);
    await stopForNow();
    expect((await savedDraft('aftercare'))?.step).toBe('sent');
    await pressRow(/Send thank-yous/);
    await expectReadyToSend(WEB_THANKS);
  });
});
