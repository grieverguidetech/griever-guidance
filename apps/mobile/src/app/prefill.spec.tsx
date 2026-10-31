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

const openService = async (session: Session) => {
  await AsyncStorage.setItem(SESSIONS_KEY, JSON.stringify([session]));
  await AsyncStorage.setItem('gg.contacts.v1', JSON.stringify(contacts));
  render(<App />);
  fireEvent.press(await screen.findByLabelText('Anna', {}, { timeout: 10000 }));
  fireEvent.press(await screen.findByRole('button', { name: /Share the service/ }));
};

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
    // Clearing a field is not filled back in while the form stays open.
    fireEvent.changeText(screen.getByPlaceholderText('e.g. 2:00 PM'), '');
    expect(screen.getByPlaceholderText('e.g. 2:00 PM').props.value).toBe('');
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
});
