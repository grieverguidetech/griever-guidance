import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { findMessage, getMessage, queryMessage, shownOf, typeMessage } from '../testing/messageBox';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Session } from '@griever/hooks';
import { defaultServiceEventsMessage } from '@griever/shared';
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

const messageOf = async () => shownOf(await screen.findByLabelText('Your message')) as string;
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
    expect(await findMessage(/Oak Chapel/)).toBeTruthy();
    expect(await messageOf()).not.toContain('St. Mary');
  });

  it('keeps a field typed on the phone when the web sends a new value, on this visit and the next', async () => {
    await openService(noPlace());
    fireEvent.changeText(await screen.findByLabelText(/^Location/), 'Our home');
    webSends({ serviceTime: '2:00 PM', servicePlace: 'Oak Chapel' });
    expect(await screen.findByDisplayValue('Our home')).toBeTruthy();
    // The untyped time still follows.
    webSends({ serviceTime: '3:30 PM', servicePlace: 'Oak Chapel' });
    expect(await findMessage(/3:30 PM/)).toBeTruthy();
    expect(screen.getByDisplayValue('Our home')).toBeTruthy();

    // The next visit: the app is opened again from what the device saved.
    screen.unmount();
    render(<App />);
    await screen.findByText('For Anna', {}, { timeout: 10000 });
    fireEvent.press(await screen.findByRole('button', { name: SHARE }));
    expect(await findMessage(/Our home/, {}, { timeout: 10000 })).toBeTruthy();
    webSends({ serviceTime: '4:00 PM', servicePlace: 'River Park' });
    expect(await findMessage(/4:00 PM/)).toBeTruthy();
    expect(getMessage(/Our home/)).toBeTruthy();
    expect(queryMessage(/River Park/)).toBeNull();
    expect(screen.queryByDisplayValue(/River Park/)).toBeNull();
    expect(screen.queryByText(/River Park/)).toBeNull();
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

  const savedDraft = (over: object) => ({
    step: 'contacts', templateCategory: 'service', templateOverrideId: null, fields: {},
    serviceDetailsKnown: null, selectedContactIds: ['c1'], includeFlowers: false, customFlorist: '',
    flowerDeliveryTarget: 'service', tone: 'plain', messageOverride: null, greeting: true, recipientNotes: {}, toldIds: [], ...over,
  });
  const reopen = async (person: Session) => {
    await AsyncStorage.setItem(SESSIONS_KEY, JSON.stringify([person]));
    await AsyncStorage.setItem('gg.contacts.v1', JSON.stringify(contacts));
    render(<App />);
    fireEvent.press(await screen.findByLabelText('Anna', {}, { timeout: 10000 }));
    fireEvent.press(await screen.findByRole('button', { name: SHARE }));
  };
  const WORDING = 'Please join us at two.';

  it('shows the web wording for an old draft whose fields were filled from the web, with no record', async () => {
    const fields = { deceasedName: 'Anna', serviceDate: 'June 14', serviceTime: '2:00 PM', serviceLocation: 'St. Mary, 12 Main St', serviceNotes: 'Reception follows.' };
    await reopen({ ...fullSession(), serviceMessage: WORDING, drafts: { service: savedDraft({ fields }) } } as Session);
    expect(await findMessage(WORDING, {}, { timeout: 10000 })).toBeTruthy();
  });

  it('shows the web wording when resumed on Ready to send with nothing typed', async () => {
    await reopen({ ...fullSession(), serviceMessage: WORDING, drafts: { service: savedDraft({ step: 'review', fields: { deceasedName: 'Anna' } }) } } as Session);
    expect(await findMessage(WORDING, {}, { timeout: 10000 })).toBeTruthy();
  });

  it('keeps an old draft\'s empty field untyped, so a later web value fills it', async () => {
    await reopen({ ...noPlace(), drafts: { service: savedDraft({ fields: { deceasedName: 'Anna', serviceLocation: '' } }) } } as Session);
    await screen.findByLabelText(/^Location/, {}, { timeout: 10000 });
    webSends({ serviceTime: '2:00 PM', servicePlace: 'Oak Chapel' });
    expect(await findMessage(/Oak Chapel/)).toBeTruthy();
  });

  it('does not bring a value the web cleared back into the saved details', async () => {
    await openService(fullSession());
    expect(await messageOf()).toContain('St. Mary');
    webSends({ serviceTime: '2:00 PM', servicePlace: '', serviceAddress: '' });
    // The phone keeps what it last showed; the saved person is not written with it again.
    expect(await messageOf()).toContain('St. Mary');
    const saved = JSON.parse((await AsyncStorage.getItem(SESSIONS_KEY)) ?? '[]')[0] as { servicePlace?: string };
    expect(saved.servicePlace ?? '').toBe('');
  });
});

// The announcement with the web's wording: the family's choice to use the template's wording (or a tone) stays (#958).
describe('the web wording and a phone choice of the suggested wording (#958)', () => {
  const WEB = 'Anna passed away peacefully.';
  const person = () => anna({ sectionStatus: { announcement: 'ready' }, announcementMessage: WEB });
  const ANNOUNCE = /^Announce the passing, .*Continue$/;
  const value = async () => shownOf(await screen.findByLabelText('Your message')) as string;
  const start = async () => {
    await AsyncStorage.setItem(SESSIONS_KEY, JSON.stringify([person()]));
    await AsyncStorage.setItem('gg.contacts.v1', JSON.stringify(contacts));
    render(<App />);
    fireEvent.press(await screen.findByLabelText('Anna', {}, { timeout: 10000 }));
    fireEvent.press(await screen.findByRole('button', { name: ANNOUNCE }));
  };
  const nextVisit = async () => {
    screen.unmount();
    render(<App />);
    await screen.findByText('For Anna', {}, { timeout: 10000 });
    fireEvent.press(await screen.findByRole('button', { name: ANNOUNCE }));
  };
  const useSuggested = async () => {
    expect(await value()).toBe(WEB);
    fireEvent.press(await screen.findByRole('button', { name: 'Use the suggested wording' }));
    return value();
  };

  it('keeps a tone chosen on the phone on the next visit', async () => {
    await start();
    const plain = await useSuggested();
    expect(plain).not.toBe(WEB);
    fireEvent.press(screen.getByRole('button', { name: 'Softer tone' }));
    const softer = await value();
    expect(softer).not.toBe(plain);
    await nextVisit();
    await waitFor(async () => expect(await value()).toBe(softer));
    expect(screen.queryByDisplayValue(WEB)).toBeNull();
  });

  it('keeps the suggested wording on the next visit', async () => {
    await start();
    const plain = await useSuggested();
    await nextVisit();
    await waitFor(async () => expect(await value()).toBe(plain));
    expect(screen.queryByDisplayValue(WEB)).toBeNull();
  });

  it('shows new web wording after the family chose the suggested wording', async () => {
    await start();
    await useSuggested();
    await nextVisit();
    act(() => {
      syncOptions?.applyRemoteFlows(
        {
          flows: [{
            id: 'flow-a', ownerId: 'user_me', role: 'owner', updatedAt: '2026-10-02T00:00:00.000Z', updatedBy: null,
            facts: { personName: 'Anna', dateOfPassing: null, serviceDate: null, obituaryUrl: null, obituaryPublisher: null, serviceReady: false },
            details: { announcementStatus: 'ready', announcementMessage: 'Anna died on Tuesday.' },
          }],
        },
        'user_me',
      );
    });
    expect(await findMessage('Anna died on Tuesday.')).toBeTruthy();
  });

  it('shows the web preview text when the web wording is not edited (#961)', async () => {
    const events = {
      obituaryUrl: 'legacy.com/a', visitationPlace: 'Oak Funeral Home', visitationDate: 'June 13', visitationTime: '6 PM',
      burialPlace: 'Hillside Cemetery', receptionPlace: 'The parish hall',
    };
    await openService({ ...fullSession(), ...events } as Session);
    const web = defaultServiceEventsMessage({ personName: 'Anna', serviceDate: 'June 14', ...DETAILS, ...events });
    const message = await messageOf();
    expect(message).toBe(web);
    expect(message).toContain('Visitation will be held at Oak Funeral Home on June 13 at 6 PM.');
  });

  it('keeps text typed on the phone (#961)', async () => {
    await openService({ ...fullSession(), visitationPlace: 'Oak Funeral Home' } as Session);
    await screen.findByLabelText('Your message');
    typeMessage('My own words');
    webSends({ ...DETAILS, visitationPlace: 'Elm Hall' });
    await waitFor(() => expect(getMessage('My own words')).toBeTruthy());
  });
});
