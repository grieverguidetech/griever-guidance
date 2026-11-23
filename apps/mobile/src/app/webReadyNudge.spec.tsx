import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { findMessage, queryMessage, typeMessage } from '../testing/messageBox';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Session } from '@griever/hooks';
import { SESSIONS_KEY } from '../lib/useDeviceSessions';

// The sync hook is replaced so a test can deliver a re-sync (applyRemoteFlows) while the app is open.
type SyncOptions = { applyRemoteFlows: (input: { flows: unknown[] }, userId: string) => void };
let syncOptions: SyncOptions | null = null;
jest.mock('../lib/useMobileFlowSync', () => ({
  useMobileFlowSync: (options: SyncOptions) => {
    syncOptions = options;
  },
}));

const { App } = require('./App') as typeof import('./App');

const NUDGE = 'Write the announcement on the web first';
const contacts = [{ contactId: 'c1', name: 'Dee', phone: '+15555550100', tier: 'family' }];
const anna = (over: object = {}) =>
  ({
    id: 'a', flowId: 'flow-a', ownerId: null, role: 'owner', personName: 'Anna', dateOfPassing: '', senderName: '', obituaryUrl: '',
    createdAt: '2026-10-01T00:00:00.000Z', lastOpenedAt: '2026-10-01T00:00:00.000Z',
    drafts: {}, serviceReady: false, recipientsNotified: {}, momentCompletedAt: {}, remindersScheduled: [],
    announcementMessage: 'Anna passed away peacefully.', ...over,
  }) as unknown as Session;

// A draft saved earlier with the web's old wording.
const staleDraft = {
  step: 'review', templateCategory: 'announcement', templateOverrideId: null, fields: {},
  serviceDetailsKnown: null, selectedContactIds: [], includeFlowers: false, customFlorist: '',
  flowerDeliveryTarget: 'service', tone: 'plain', messageOverride: 'Old web wording.', messageFromWeb: true, greeting: true, recipientNotes: {}, toldIds: [],
};

const open = async (person: Session) => {
  await AsyncStorage.setItem(SESSIONS_KEY, JSON.stringify([person]));
  await AsyncStorage.setItem('gg.contacts.v1', JSON.stringify(contacts));
  render(<App />);
  fireEvent.press(await screen.findByLabelText('Anna', {}, { timeout: 10000 }));
  fireEvent.press(await screen.findByRole('button', { name: /^Announce the passing, .*Continue$/ }));
};

// The web un-marks the step: the status key comes back null.
const webUnmarks = () =>
  act(() => {
    syncOptions?.applyRemoteFlows(
      {
        flows: [{
          id: 'flow-a', ownerId: 'user_me', role: 'owner', updatedAt: '2026-10-02T00:00:00.000Z', updatedBy: null,
          facts: { personName: 'Anna', dateOfPassing: null, serviceDate: null, obituaryUrl: null, obituaryPublisher: null, serviceReady: false },
          details: { announcementStatus: null },
        }],
      },
      'user_me',
    );
  });

beforeEach(async () => {
  await AsyncStorage.clear();
  syncOptions = null;
});

describe('the web Ready status and the announcement send screen (#949)', () => {
  it('shows the nudge when the web has text but the step is not Ready', async () => {
    await open(anna({ sectionStatus: {} }));
    expect(await screen.findByRole('heading', { name: NUDGE })).toBeTruthy();
    expect(screen.queryByLabelText('Your message')).toBeNull();
  });

  it('opens the send screen when Ready, brings the nudge back when Ready is removed, in the same visit and the next', async () => {
    await open(anna({ sectionStatus: { announcement: 'ready' } }));
    expect(await screen.findByLabelText('Your message')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: NUDGE })).toBeNull();

    webUnmarks();
    expect(await screen.findByRole('heading', { name: NUDGE })).toBeTruthy();
    expect(screen.queryByLabelText('Your message')).toBeNull();

    // The next visit: the app is opened again from what the device saved.
    screen.unmount();
    render(<App />);
    // The device reopens on the person's hub; the announcement is still not Ready, so the nudge shows.
    await screen.findByText('For Anna', {}, { timeout: 10000 });
    fireEvent.press(await screen.findByRole('button', { name: /^Announce the passing, .*Continue$/ }));
    expect(await screen.findByRole('heading', { name: NUDGE }, { timeout: 10000 })).toBeTruthy();
    expect(screen.queryByLabelText('Your message')).toBeNull();
  });

  it('keeps the nudge when an old saved draft holds earlier web wording and the web has changed it', async () => {
    await open(anna({ sectionStatus: {}, announcementMessage: 'New web wording.', drafts: { announcement: staleDraft } }));
    expect(await screen.findByRole('heading', { name: NUDGE })).toBeTruthy();
  });

  it('shows the web\'s current wording, not the old saved copy, when Ready is on', async () => {
    await open(anna({ sectionStatus: { announcement: 'ready' }, announcementMessage: 'New web wording.', drafts: { announcement: staleDraft } }));
    expect(await findMessage('New web wording.')).toBeTruthy();
    expect(queryMessage('Old web wording.')).toBeNull();
  });

  it('treats an old saved draft equal to the web wording, with no flag, as web text: the nudge shows', async () => {
    const { messageFromWeb: _flag, ...legacy } = { ...staleDraft, messageOverride: 'Anna passed away peacefully.' };
    await open(anna({ sectionStatus: {}, drafts: { announcement: legacy } }));
    expect(await screen.findByRole('heading', { name: NUDGE })).toBeTruthy();
  });

  it('keeps an old saved draft that differs from the web wording, with no flag, as a phone edit', async () => {
    const { messageFromWeb: _flag, ...legacy } = { ...staleDraft, messageOverride: 'My own words.' };
    await open(anna({ sectionStatus: {}, drafts: { announcement: legacy } }));
    expect(await findMessage('My own words.')).toBeTruthy();
  });

  it('keeps the send screen when the words were edited on the phone, even after Ready is removed', async () => {
    await open(anna({ sectionStatus: { announcement: 'ready' } }));
    await screen.findByLabelText('Your message');
    typeMessage('My own words.');
    webUnmarks();
    expect(await findMessage('My own words.')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: NUDGE })).toBeNull();
  });
});
