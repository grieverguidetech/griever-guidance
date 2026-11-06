import { describe, expect, it } from '@jest/globals';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
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

const openMoment = async (session: Session, moment: RegExp, label: string = 'Anna') => {
  await AsyncStorage.setItem(SESSIONS_KEY, JSON.stringify([session]));
  await AsyncStorage.setItem('gg.contacts.v1', JSON.stringify(contacts));
  render(<App />);
  fireEvent.press(await screen.findByLabelText(label, {}, { timeout: 10000 }));
  fireEvent.press(await screen.findByRole('button', { name: moment }));
};
const openService = (session: Session) => openMoment(session, /Share the service/);

// Service and thank-you open on Who should get this?; the planned details are on the send screen.
const toConfirm = async () => {
  fireEvent.press(await screen.findByText('Dee'));
  fireEvent.press(screen.getByText(/^Done/));
};

describe('send flow starts from the planned details', () => {
  it('opens Who should get this?, then Confirm shows the planned time and place', async () => {
    await openService({ ...base, serviceTime: '2:00 PM', servicePlace: 'St. Mary', serviceAddress: '12 Main St' } as Session);
    expect(await screen.findByRole('heading', { name: 'Who should get this?' })).toBeTruthy();
    await toConfirm();
    expect(await screen.findByDisplayValue('2:00 PM')).toBeTruthy();
    expect(screen.getByDisplayValue('St. Mary, 12 Main St')).toBeTruthy();
  });

  it('carries the planned date from the person to Confirm', async () => {
    await openService({ ...base, serviceDate: 'June 14' } as Session);
    await screen.findByRole('heading', { name: 'Who should get this?' });
    await toConfirm();
    expect((await screen.findByLabelText('Service date')).props.value).toBe('June 14');
  });

  it('uses the edited service message as the message', async () => {
    await openService({ ...base, serviceDate: 'June 14', serviceTime: '2:00 PM', servicePlace: 'St. Mary', serviceMessage: 'Please join us at two.' } as Session);
    await screen.findByRole('heading', { name: 'Who should get this?' });
    await toConfirm();
    expect(await screen.findByText('Please join us at two.')).toBeTruthy();
  });

  it('never overwrites a draft in progress', async () => {
    const draft = {
      step: 'contacts', templateCategory: 'service', templateOverrideId: null,
      fields: { serviceDate: 'June 20', serviceTime: '9:00 AM', serviceLocation: 'Home' }, serviceDetailsKnown: null, selectedContactIds: [],
      includeFlowers: false, customFlorist: '', flowerDeliveryTarget: 'service', tone: 'plain', messageOverride: null,
    };
    await openService({
      ...base, serviceDate: 'June 14', servicePlace: 'St. Mary', serviceTime: '2:00 PM', serviceMessage: 'Synced wording', drafts: { service: draft },
    } as unknown as Session);
    await screen.findByRole('heading', { name: 'Who should get this?' });
    await toConfirm();
    fireEvent.press(await screen.findByRole('button', { name: 'Change date, time or place' }));
    expect(await screen.findByDisplayValue('9:00 AM')).toBeTruthy();
    expect(screen.queryByText('Synced wording')).toBeNull();
  });

  it('keeps the edited thank-you wording when the name is filled from the person', async () => {
    await openMoment({ ...base, senderName: 'The Hayes Family', thanksMessage: 'Thank you all.' } as Session, /thank-yous/);
    await screen.findByRole('heading', { name: 'Who should get this?' });
    await toConfirm();
    expect(await screen.findByText('Thank you all.')).toBeTruthy();
  });

  // Rewritten on purpose (#630, MOB-9, #559 Decision 4). It used to pin that the full obituaryText
  // was the text message. Now the obituary text is emailed to the publisher, and the text message
  // is the obituary-link template: the name and the link.
  it('texts the obituary link template, not the edited obituary text', async () => {
    await openMoment({ ...base, obituaryText: 'Anna loved the garden.' } as Session, /Share the obituary/);
    fireEvent.changeText(await screen.findByLabelText('Link to the obituary'), 'https://legacy.com/anna');
    fireEvent.press(screen.getByRole('button', { name: 'Choose who to send it to' }));
    fireEvent.press(await screen.findByText('Dee'));
    fireEvent.press(screen.getByText(/^Done/));
    await screen.findByRole('heading', { name: 'Share the obituary' });
    expect(screen.getByText('We wanted to share the obituary for Anna:\n\nhttps://legacy.com/anna\n\nThank you for your love and support.')).toBeTruthy();
    expect(screen.queryByText(/Anna loved the garden/)).toBeNull();
  });

  // The obituary moment opens on its own screen (the link is on the person), then the contacts step.
  const toConfirmFromObituary = async () => {
    fireEvent.press(await screen.findByRole('button', { name: 'Choose who to send it to' }));
    await toConfirm();
  };

  const obituaryDraft = (messageOverride: string) => ({
    step: 'contacts', templateCategory: 'obituary', templateOverrideId: null,
    fields: { deceasedName: 'Anna', obituaryUrl: 'https://legacy.com/anna' },
    serviceDetailsKnown: null, selectedContactIds: [], includeFlowers: false, customFlorist: '',
    flowerDeliveryTarget: 'service', tone: 'plain', messageOverride,
  });

  it('drops an old obituary draft whose message is the obituary text', async () => {
    await openMoment(
      { ...base, obituaryUrl: 'https://legacy.com/anna', obituaryText: 'Anna loved the garden.', drafts: { obituary: obituaryDraft('Anna loved the garden.') } } as unknown as Session,
      /Share the obituary/,
    );
    await toConfirmFromObituary();
    await screen.findByRole('heading', { name: 'Share the obituary' });
    expect(screen.getByText('We wanted to share the obituary for Anna:\n\nhttps://legacy.com/anna\n\nThank you for your love and support.')).toBeTruthy();
    expect(screen.queryByText('Anna loved the garden.')).toBeNull();
  });

  it('keeps a hand edit on the obituary message through to Confirm', async () => {
    await openMoment(
      { ...base, obituaryUrl: 'https://legacy.com/anna', obituaryText: 'Anna loved the garden.', drafts: { obituary: obituaryDraft('Here is her obituary, with love.') } } as unknown as Session,
      /Share the obituary/,
    );
    await toConfirmFromObituary();
    await screen.findByRole('heading', { name: 'Share the obituary' });
    expect(screen.getByText('Here is her obituary, with love.')).toBeTruthy();
  });

  it('leaves a draft with an emptied message alone', async () => {
    const draft = {
      step: 'contacts', templateCategory: 'service', templateOverrideId: null, fields: {},
      serviceDetailsKnown: null, selectedContactIds: [], includeFlowers: false, customFlorist: '',
      flowerDeliveryTarget: 'service', tone: 'plain', messageOverride: '',
    };
    await openService({ ...base, serviceTime: '2:00 PM', drafts: { service: draft } } as unknown as Session);
    await screen.findByRole('heading', { name: 'Who should get this?' });
    await toConfirm();
    fireEvent.press(await screen.findByRole('button', { name: 'Edit wording' }));
    expect(await screen.findByDisplayValue('')).toBeTruthy();
    expect(screen.queryByDisplayValue('2:00 PM')).toBeNull();
  });

  it('saves a service date typed on Confirm to the person', async () => {
    await openService({ ...base } as Session);
    await screen.findByRole('heading', { name: 'Who should get this?' });
    await toConfirm();
    fireEvent.changeText(await screen.findByLabelText(/Service date/), 'July 3');
    await waitFor(async () => {
      const [saved] = JSON.parse((await AsyncStorage.getItem(SESSIONS_KEY)) ?? '[]') as { serviceDate?: string }[];
      expect(saved?.serviceDate).toBe('July 3');
    });
  });

  it('leaves the saved service date alone when nothing is changed on Confirm', async () => {
    await openService({ ...base, serviceDate: 'June 14' } as Session);
    await screen.findByRole('heading', { name: 'Who should get this?' });
    await toConfirm();
    expect((await screen.findByLabelText('Service date')).props.value).toBe('June 14');
    await new Promise((r) => setTimeout(r, 100));
    const [saved] = JSON.parse((await AsyncStorage.getItem(SESSIONS_KEY)) ?? '[]') as { serviceDate?: string }[];
    expect(saved?.serviceDate).toBe('June 14');
  });

  // The announcement has no intro (#671). Its first screen is the people step; the message still
  // carries the name and date from setup, and the saved name is never wiped by opening it.
  describe('the announcement without its intro (#671)', () => {
    it('carries the name and date of passing from setup to Ready to send, and keeps them saved', async () => {
      await openMoment({ ...base, dateOfPassing: 'May 2, 2026' } as Session, /Next/, 'Anna, passed May 2, 2026');
      await screen.findByRole('heading', { name: 'Who should get this?' });
      await toConfirm();
      expect(await screen.findByText(/Anna passed away on May 2, 2026/)).toBeTruthy();
      await new Promise((r) => setTimeout(r, 100));
      const [saved] = JSON.parse((await AsyncStorage.getItem(SESSIONS_KEY)) ?? '[]') as { personName?: string; dateOfPassing?: string }[];
      expect(saved?.personName).toBe('Anna');
      expect(saved?.dateOfPassing).toBe('May 2, 2026');
    });

    it.each(['announce', 'serviceKnown'])('resumes a draft saved on the old %s step, with its note', async (step) => {
      const draft = {
        step, templateCategory: 'announcement', templateOverrideId: null,
        fields: { personalNote: 'She was at peace.' }, serviceDetailsKnown: null, selectedContactIds: [],
        includeFlowers: false, customFlorist: '', flowerDeliveryTarget: 'service', tone: 'plain', messageOverride: null,
      };
      await openMoment({ ...base, drafts: { announcement: draft } } as unknown as Session, /Next|Continue/);
      expect(await screen.findByRole('heading', { name: 'Who should get this?' })).toBeTruthy();
      expect(screen.queryByLabelText(/Anything you'd like to add/)).toBeNull();
      await toConfirm();
      expect(await screen.findByText(/She was at peace\./)).toBeTruthy();
    });
  });
});
