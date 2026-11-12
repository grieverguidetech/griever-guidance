import { describe, expect, it } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Session } from '@griever/hooks';
import { App } from './App';
import { SESSIONS_KEY } from '../lib/useDeviceSessions';

// #674: the service and the obituary link start with "Everyone you told" picked, once, on a fresh draft.
const base = {
  id: 'a', flowId: 'flow-a', ownerId: null, role: 'owner', personName: 'Anna', dateOfPassing: '', senderName: '', obituaryUrl: 'https://legacy.com/anna',
  createdAt: '2026-10-01T00:00:00.000Z', lastOpenedAt: '2026-10-01T00:00:00.000Z',
  drafts: {}, serviceReady: false, recipientsNotified: {}, momentCompletedAt: {}, remindersScheduled: [],
} as unknown as Session;

const contacts = [
  { contactId: 'c1', name: 'Dee', phone: '+15555550100', tier: 'family' },
  { contactId: 'c2', name: 'Sam', phone: '+15555550101', tier: 'family' },
  { contactId: 'c3', name: 'Lou', phone: '+15555550102', tier: 'family' },
];

const open = async (session: Session, moment: RegExp) => {
  await AsyncStorage.setItem(SESSIONS_KEY, JSON.stringify([session]));
  await AsyncStorage.setItem('gg.contacts.v1', JSON.stringify(contacts));
  render(<App />);
  fireEvent.press(await screen.findByLabelText('Anna', {}, { timeout: 10000 }));
  // A ready moment shows its card and the bar's button under one name; either opens it.
  fireEvent.press((await screen.findAllByRole('button', { name: moment }))[0]);
};

const toldDeeAndSam = { announcement: ['c1', 'c2'] };

const draftAt = (category: string, step: string, ids: string[]) => ({
  step, templateCategory: category, templateOverrideId: null,
  fields: { deceasedName: 'Anna', serviceDate: 'June 14' }, serviceDetailsKnown: null, selectedContactIds: ids,
  includeFlowers: false, customFlorist: '', flowerDeliveryTarget: 'service', tone: 'plain', messageOverride: null,
});

describe('who starts picked (#674)', () => {
  it('opens the service on Ready to send with everyone you told, named as a group', async () => {
    await open({ ...base, recipientsNotified: toldDeeAndSam } as Session, /Share the service/);
    expect(await screen.findByRole('button', { name: 'Change who gets this' })).toBeTruthy();
    // The names line is gone; the count is on the send button.
    expect(screen.queryByText(/^To /)).toBeNull();
    expect(screen.queryByText('Dee and Sam')).toBeNull();
    expect(screen.getByRole('button', { name: 'Text 2 people' })).toBeTruthy();
  });

  it('leaves out a person who is in both the announcement and the service', async () => {
    await open({ ...base, recipientsNotified: { announcement: ['c1', 'c2'], service: ['c1'] } } as Session, /Share the service/);
    expect(await screen.findByRole('button', { name: 'Change who gets this' })).toBeTruthy();
    expect(screen.queryByText(/^To /)).toBeNull();
    expect(screen.getByRole('button', { name: 'Text 1 person' })).toBeTruthy();
  });

  it('starts the obituary link with everyone you told', async () => {
    await open({ ...base, recipientsNotified: toldDeeAndSam } as Session, /Share the obituary/);
    fireEvent.press(await screen.findByRole('button', { name: 'Choose who to send it to' }));
    expect(await screen.findByRole('button', { name: 'Change who gets this' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Text 2 people' })).toBeTruthy();
    expect(screen.queryByText(/^To /)).toBeNull();
  });

  it('starts the thank-yous with nobody picked', async () => {
    await open({ ...base, recipientsNotified: toldDeeAndSam } as Session, /thank-yous/);
    expect(await screen.findByRole('button', { name: /^Choose who to tell/ })).toBeTruthy();
    expect(screen.queryByText(/^To /)).toBeNull();
  });

  it('shows Choose who to tell when nobody qualifies', async () => {
    await open({ ...base, recipientsNotified: {} } as Session, /Share the service/);
    expect(await screen.findByRole('button', { name: /^Choose who to tell/ })).toBeTruthy();
    expect(screen.queryByText(/^To /)).toBeNull();
  });

  it('keeps a selection the family cleared by hand empty when the moment is reopened', async () => {
    await open({ ...base, recipientsNotified: toldDeeAndSam, drafts: { service: draftAt('service', 'review', []) } } as unknown as Session, /Share the service/);
    expect(await screen.findByRole('button', { name: /^Choose who to tell/ })).toBeTruthy();
    expect(screen.queryByText(/^To /)).toBeNull();
  });

  it('adds nothing to a draft that was resumed with its own people', async () => {
    await open({ ...base, recipientsNotified: toldDeeAndSam, drafts: { service: draftAt('service', 'review', ['c3']) } } as unknown as Session, /Share the service/);
    expect(await screen.findByRole('button', { name: 'Change who gets this' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Text 1 person' })).toBeTruthy();
    expect(screen.queryByText(/^To /)).toBeNull();
  });

  it('picks nobody on reopening after a send that reached everyone you told', async () => {
    await open({ ...base, recipientsNotified: { announcement: ['c1', 'c2'], service: ['c1', 'c2'] }, drafts: { service: draftAt('service', 'sent', ['c1', 'c2']) } } as unknown as Session, /Share the service/);
    expect(await screen.findByRole('button', { name: /^Choose who to tell/ })).toBeTruthy();
    expect(screen.queryByText(/^To /)).toBeNull();
  });

  it('picks the people told but not yet sent on reopening after a partial send', async () => {
    await open({ ...base, recipientsNotified: { announcement: ['c1', 'c2'], service: ['c1'] }, drafts: { service: draftAt('service', 'sent', ['c1']) } } as unknown as Session, /Share the service/);
    expect(await screen.findByRole('button', { name: 'Change who gets this' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Text 1 person' })).toBeTruthy();
    expect(screen.queryByText(/^To /)).toBeNull();
  });
});
