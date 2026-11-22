import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Session } from '@griever/hooks';
import { SESSIONS_KEY } from '../lib/useDeviceSessions';
import { onFlowPullRequest } from '../lib/requestFlowPull';

// The sync hook is replaced so a test can deliver a re-sync (applyRemoteFlows) while the app is open.
type SyncOptions = { applyRemoteFlows: (input: { flows: unknown[] }, userId: string) => void };
let syncOptions: SyncOptions | null = null;
jest.mock('../lib/useMobileFlowSync', () => ({
  useMobileFlowSync: (options: SyncOptions) => {
    syncOptions = options;
  },
}));

const { App } = require('./App') as typeof import('./App');

const contacts = [{ contactId: 'c1', name: 'Dee', phone: '+15555550100', tier: 'family' }];
const anna = (over: object = {}) =>
  ({
    id: 'a', flowId: 'flow-a', ownerId: null, role: 'owner', personName: 'Anna', dateOfPassing: '', senderName: '', obituaryUrl: '',
    serviceType: 'Funeral', createdAt: '2026-10-01T00:00:00.000Z', lastOpenedAt: '2026-10-01T00:00:00.000Z',
    drafts: {}, serviceReady: false, recipientsNotified: {}, momentCompletedAt: {}, remindersScheduled: [],
    sectionStatus: { service: 'ready' }, ...over,
  }) as unknown as Session;

const SHARE = /Share the service/;
const toReview = async () => {
  fireEvent.press(await screen.findByRole('button', { name: /^(Choose who to tell|Change who you're texting)/ }));
  await screen.findByRole('heading', { name: 'Who should get this?' });
  fireEvent.press(await screen.findByText('Dee'));
  fireEvent.press(screen.getByText(/^Done/));
};
const openService = async (person: Session) => {
  await AsyncStorage.setItem(SESSIONS_KEY, JSON.stringify([person]));
  await AsyncStorage.setItem('gg.contacts.v1', JSON.stringify(contacts));
  render(<App />);
  fireEvent.press(await screen.findByLabelText('Anna', {}, { timeout: 10000 }));
  fireEvent.press(await screen.findByRole('button', { name: SHARE }));
  await toReview();
};

// The web pushes the service details (and keeps the section Ready).
const webSends = (details: Record<string, string>, serviceDate = 'June 14') =>
  act(() => {
    syncOptions?.applyRemoteFlows(
      {
        flows: [{
          id: 'flow-a', ownerId: 'user_me', role: 'owner', updatedAt: '2026-10-02T00:00:00.000Z', updatedBy: null,
          facts: { personName: 'Anna', dateOfPassing: null, serviceDate, obituaryUrl: null, obituaryPublisher: null, serviceReady: true },
          details: { serviceStatus: 'ready', ...details },
        }],
      },
      'user_me',
    );
  });

const DETAILS = { serviceTime: '2:00 PM', servicePlace: 'St. Mary', serviceAddress: '12 Main St', serviceNotes: 'Reception follows.' };
const fullSession = () => anna({ serviceDate: 'June 14', ...DETAILS });

beforeEach(async () => {
  await AsyncStorage.clear();
  syncOptions = null;
});

const messageOf = async () => (await screen.findByLabelText('Your message')).props.value as string;
// The date and time are here, the place is not: the form shows its Location field.
const noPlace = () => anna({ serviceDate: 'June 14', serviceTime: '2:00 PM' });

describe('service form fields follow the web until typed on the phone (#958)', () => {
  it('shows the web details in the message when the service is Ready', async () => {
    await openService(fullSession());
    const message = await messageOf();
    expect(message).toContain('June 14');
    expect(message).toContain('2:00 PM');
    expect(message).toContain('St. Mary');
    expect(message).toContain('Reception follows.');
  });

  it('fills the details in when they arrive after the form opened', async () => {
    await openService(anna());
    expect(await messageOf()).not.toContain('St. Mary');
    webSends(DETAILS);
    expect(await messageOf()).toContain('St. Mary');
    expect(await messageOf()).toContain('2:00 PM');
    expect(await messageOf()).toContain('June 14');
  });

  it('follows a changed web value while the field is untouched', async () => {
    await openService(fullSession());
    expect(await messageOf()).toContain('St. Mary');
    webSends({ ...DETAILS, servicePlace: 'Oak Chapel' });
    expect(await screen.findByDisplayValue(/Oak Chapel/)).toBeTruthy();
    expect(await messageOf()).not.toContain('St. Mary');
  });

  it('keeps a field typed on the phone when the web sends a new value, on this visit and the next', async () => {
    await openService(noPlace());
    fireEvent.changeText(await screen.findByLabelText(/^Location/), 'Our home');
    webSends({ serviceTime: '2:00 PM', servicePlace: 'Oak Chapel' });
    expect(await screen.findByDisplayValue('Our home')).toBeTruthy();
    // The untyped time still follows.
    webSends({ serviceTime: '3:30 PM', servicePlace: 'Oak Chapel' });
    expect(await screen.findByDisplayValue(/3:30 PM/)).toBeTruthy();
    expect(screen.getByDisplayValue('Our home')).toBeTruthy();

    // The next visit: the app is opened again from what the device saved.
    screen.unmount();
    render(<App />);
    await screen.findByText('For Anna', {}, { timeout: 10000 });
    fireEvent.press(await screen.findByRole('button', { name: SHARE }));
    expect(await screen.findByDisplayValue(/Our home/, {}, { timeout: 10000 })).toBeTruthy();
    webSends({ serviceTime: '4:00 PM', servicePlace: 'River Park' });
    expect(await screen.findByDisplayValue(/4:00 PM/)).toBeTruthy();
    expect(screen.getByDisplayValue(/Our home/)).toBeTruthy();
    expect(screen.queryByDisplayValue(/River Park/)).toBeNull();
  });

  it('fills the service details of an old saved draft that has only the name filled', async () => {
    const oldDraft = {
      step: 'review', templateCategory: 'service', templateOverrideId: null, fields: { deceasedName: 'Anna' },
      serviceDetailsKnown: null, selectedContactIds: ['c1'], includeFlowers: false, customFlorist: '',
      flowerDeliveryTarget: 'service', tone: 'plain', messageOverride: null, greeting: true, recipientNotes: {}, toldIds: [],
    };
    await AsyncStorage.setItem(SESSIONS_KEY, JSON.stringify([{ ...fullSession(), drafts: { service: oldDraft } }]));
    await AsyncStorage.setItem('gg.contacts.v1', JSON.stringify(contacts));
    render(<App />);
    fireEvent.press(await screen.findByLabelText('Anna', {}, { timeout: 10000 }));
    fireEvent.press(await screen.findByRole('button', { name: SHARE }));
    await screen.findByLabelText('Your message', {}, { timeout: 10000 });
    const message = await messageOf();
    expect(message).toContain('St. Mary');
    expect(message).toContain('2:00 PM');
  });

  it('asks for a pull when the moment\'s first form opens', async () => {
    const pulls = jest.fn();
    const off = onFlowPullRequest(pulls);
    await openService(fullSession());
    off();
    expect(pulls).toHaveBeenCalled();
  });
});
