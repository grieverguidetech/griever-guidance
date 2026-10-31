import { describe, expect, it } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Session } from '@griever/hooks';
import { App } from './App';
import { SESSIONS_KEY } from '../lib/useDeviceSessions';

const base = {
  id: 'a', flowId: 'flow-a', ownerId: null, role: 'owner', personName: 'Anna', dateOfPassing: '', senderName: '', obituaryUrl: '',
  createdAt: '2026-10-01T00:00:00.000Z', lastOpenedAt: '2026-10-01T00:00:00.000Z',
  drafts: {}, serviceReady: false, recipientsNotified: {}, momentCompletedAt: {}, remindersScheduled: [],
} as unknown as Session;

const contacts = [{ contactId: 'c1', name: 'Dee', phone: '+15555550100', tier: 'family' }];

const openMoment = async (session: Session, moment: RegExp) => {
  await AsyncStorage.setItem(SESSIONS_KEY, JSON.stringify([session]));
  await AsyncStorage.setItem('gg.contacts.v1', JSON.stringify(contacts));
  render(<App />);
  fireEvent.press(await screen.findByLabelText('Anna', {}, { timeout: 10000 }));
  fireEvent.press(await screen.findByRole('button', { name: moment }));
};
const openService = (session: Session) => openMoment(session, /Share the service/);

const toConfirm = async () => {
  fireEvent.press(await screen.findByText('Continue'));
  fireEvent.press(await screen.findByText('Dee'));
  fireEvent.press(screen.getByText('Continue'));
};

describe('send flow starts from the planned details', () => {
  it('fills the service form once from the synced time and place', async () => {
    await openService({ ...base, serviceTime: '2:00 PM', servicePlace: 'St. Mary', serviceAddress: '12 Main St' } as Session);
    expect((await screen.findByPlaceholderText('e.g. 2:00 PM')).props.value).toBe('2:00 PM');
    expect(screen.getByPlaceholderText('Start typing a place or address').props.value).toBe('St. Mary, 12 Main St');
    // Clearing every prefilled field is not filled back in while the form stays open.
    fireEvent.changeText(screen.getByPlaceholderText('e.g. 2:00 PM'), '');
    fireEvent.changeText(screen.getByPlaceholderText('Start typing a place or address'), '');
    expect(screen.getByPlaceholderText('e.g. 2:00 PM').props.value).toBe('');
    expect(screen.getByPlaceholderText('Start typing a place or address').props.value).toBe('');
  });

  it('uses the edited service message as the message', async () => {
    await openService({ ...base, serviceDate: 'June 14', serviceTime: '2:00 PM', servicePlace: 'St. Mary', serviceMessage: 'Please join us at two.' } as Session);
    await screen.findByPlaceholderText('e.g. 2:00 PM');
    await toConfirm();
    expect(await screen.findByDisplayValue('Please join us at two.')).toBeTruthy();
  });

  it('never overwrites a draft in progress', async () => {
    const draft = {
      step: 'details', templateCategory: 'service', templateOverrideId: null,
      fields: { serviceDate: 'June 20', serviceTime: '9:00 AM', serviceLocation: 'Home' }, serviceDetailsKnown: null, selectedContactIds: [],
      includeFlowers: false, customFlorist: '', flowerDeliveryTarget: 'service', tone: 'plain', messageOverride: null,
    };
    await openService({
      ...base, serviceDate: 'June 14', servicePlace: 'St. Mary', serviceTime: '2:00 PM', serviceMessage: 'Synced wording', drafts: { service: draft },
    } as unknown as Session);
    expect((await screen.findByPlaceholderText('e.g. 2:00 PM')).props.value).toBe('9:00 AM');
    await toConfirm();
    expect(screen.queryByDisplayValue('Synced wording')).toBeNull();
  });

  it('keeps the edited thank-you wording when the name is filled from the person', async () => {
    await openMoment({ ...base, senderName: 'The Hayes Family', thanksMessage: 'Thank you all.' } as Session, /thank-yous/);
    expect((await screen.findByPlaceholderText('e.g. Margaret Ellen Hayes')).props.value).toBe('Anna');
    expect(screen.getByPlaceholderText('e.g. The Hayes Family').props.value).toBe('The Hayes Family');
    await toConfirm();
    expect(await screen.findByText('Thank you all.')).toBeTruthy();
  });

  it('applies the edited obituary text on its first step', async () => {
    await openMoment({ ...base, obituaryText: 'Anna loved the garden.' } as Session, /Share the obituary/);
    fireEvent.changeText(await screen.findByLabelText('Link to the obituary'), 'https://legacy.com/anna');
    fireEvent.press(screen.getByRole('button', { name: 'Choose who to send it to' }));
    fireEvent.press(await screen.findByText('Dee'));
    fireEvent.press(screen.getByText('Continue'));
    expect(await screen.findByText('Anna loved the garden.')).toBeTruthy();
  });

  it('leaves a draft with an emptied message alone', async () => {
    const draft = {
      step: 'details', templateCategory: 'service', templateOverrideId: null, fields: {},
      serviceDetailsKnown: null, selectedContactIds: [], includeFlowers: false, customFlorist: '',
      flowerDeliveryTarget: 'service', tone: 'plain', messageOverride: '',
    };
    await openService({ ...base, serviceTime: '2:00 PM', drafts: { service: draft } } as unknown as Session);
    expect((await screen.findByPlaceholderText('e.g. 2:00 PM')).props.value).toBe('');
  });
});
