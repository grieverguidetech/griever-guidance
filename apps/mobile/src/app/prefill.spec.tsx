import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Session } from '@griever/hooks';
import { App } from './App';
import { SESSIONS_KEY } from '../lib/useDeviceSessions';

// The signed-in account is set per test. Null means nobody is signed in.
let mockProfile: { id: string; senderName: string; firstName?: string | null; contactSource: null; accountType: 'owner' } | null = null;
jest.mock('../lib/AccountProvider', () => ({
  ...jest.requireActual<object>('../lib/AccountProvider'),
  useAccount: () => (mockProfile ? { status: 'signed_in', isSignedIn: true, profile: mockProfile } : null),
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockProfile = null;
});
// Arriving on a moment opens Ready to send, never the people list. This presses the button that opens the list
// ("Choose who to tell", or "Change who you're texting" when people are already picked) and waits for its heading.
const openPeople = async () => {
  fireEvent.press(await screen.findByRole('button', { name: /^(Choose who to tell|Change who you're texting)/ }));
  return screen.findByRole('heading', { name: 'Who should get this?' });
};

const base = {
  id: 'a', flowId: 'flow-a', ownerId: null, role: 'owner', personName: 'Anna', dateOfPassing: '', senderName: '', obituaryUrl: '', announcementMessage: 'Anna passed away peacefully.', serviceType: 'Funeral', thanksMessage: 'Thank you for being there.',
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
    expect(await openPeople()).toBeTruthy();
    await toConfirm();
    expect((await screen.findByLabelText('Time')).props.accessibilityValue.text).toBe('2:00 PM');
    expect(screen.getByDisplayValue('St. Mary, 12 Main St')).toBeTruthy();
  });

  it('carries the planned date from the person to Confirm', async () => {
    await openService({ ...base, serviceDate: 'June 14' } as Session);
    await openPeople();
    await toConfirm();
    expect((await screen.findByLabelText('Service date')).props.accessibilityValue.text).toBe('June 14');
  });

  it('uses the edited service message as the message', async () => {
    await openService({ ...base, serviceDate: 'June 14', serviceTime: '2:00 PM', servicePlace: 'St. Mary', serviceMessage: 'Please join us at two.' } as Session);
    await openPeople();
    await toConfirm();
    expect(await screen.findByDisplayValue('Please join us at two.')).toBeTruthy();
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
    await openPeople();
    await toConfirm();
    expect((await screen.findByLabelText('Your message')).props.value).toContain('9:00 AM');
    expect(screen.queryByRole('button', { name: 'Change date, time or place' })).toBeNull();
    expect(screen.queryByText('Synced wording')).toBeNull();
  });

  it('keeps the edited thank-you wording when the name is filled from the person', async () => {
    await openMoment({ ...base, senderName: 'The Hayes Family', thanksMessage: 'Thank you all.' } as Session, /thank-yous/);
    await openPeople();
    await toConfirm();
    expect(await screen.findByDisplayValue('Thank you all.')).toBeTruthy();
  });

  // Rewritten on purpose (#630, MOB-9, #559 Decision 4). It used to pin that the full obituaryText
  // was the text message. Now the obituary text is emailed to the publisher, and the text message
  // is the obituary-link template: the name and the link.
  it('texts the obituary link template, not the edited obituary text', async () => {
    await openMoment({ ...base, obituaryText: 'Anna loved the garden.' } as Session, /Share the obituary/);
    fireEvent.changeText(await screen.findByLabelText('Link to the obituary'), 'https://legacy.com/anna');
    fireEvent.press(screen.getByRole('button', { name: 'Choose who to send it to' }));
    await openPeople();
    fireEvent.press(await screen.findByText('Dee'));
    fireEvent.press(screen.getByText(/^Done/));
    await screen.findByRole('heading', { name: 'Share the obituary' });
    expect(screen.getByDisplayValue('We wanted to share the obituary for Anna:\n\nhttps://legacy.com/anna\n\nThank you for your love and support.')).toBeTruthy();
    expect(screen.queryByDisplayValue(/Anna loved the garden/)).toBeNull();
  });

  // The obituary moment opens on its own screen (the link is on the person), then the contacts step.
  const toConfirmFromObituary = async () => {
    fireEvent.press(await screen.findByRole('button', { name: 'Choose who to send it to' }));
    await openPeople();
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
      { ...base, obituaryUrl: 'https://legacy.com/anna', announcementMessage: 'Anna passed away peacefully.', serviceType: 'Funeral', thanksMessage: 'Thank you for being there.', obituaryText: 'Anna loved the garden.', drafts: { obituary: obituaryDraft('Anna loved the garden.') } } as unknown as Session,
      /Share the obituary/,
    );
    await toConfirmFromObituary();
    await screen.findByRole('heading', { name: 'Share the obituary' });
    expect(screen.getByDisplayValue('We wanted to share the obituary for Anna:\n\nhttps://legacy.com/anna\n\nThank you for your love and support.')).toBeTruthy();
    expect(screen.queryByDisplayValue('Anna loved the garden.')).toBeNull();
  });

  it('keeps a hand edit on the obituary message through to Confirm', async () => {
    await openMoment(
      { ...base, obituaryUrl: 'https://legacy.com/anna', announcementMessage: 'Anna passed away peacefully.', serviceType: 'Funeral', thanksMessage: 'Thank you for being there.', obituaryText: 'Anna loved the garden.', drafts: { obituary: obituaryDraft('Here is her obituary, with love.') } } as unknown as Session,
      /Share the obituary/,
    );
    await toConfirmFromObituary();
    await screen.findByRole('heading', { name: 'Share the obituary' });
    expect(screen.getByDisplayValue('Here is her obituary, with love.')).toBeTruthy();
  });

  it('leaves a draft with an emptied message alone', async () => {
    const draft = {
      step: 'contacts', templateCategory: 'service', templateOverrideId: null, fields: {},
      serviceDetailsKnown: null, selectedContactIds: [], includeFlowers: false, customFlorist: '',
      flowerDeliveryTarget: 'service', tone: 'plain', messageOverride: '',
    };
    await openService({ ...base, serviceTime: '2:00 PM', drafts: { service: draft } } as unknown as Session);
    await openPeople();
    await toConfirm();
    expect(await screen.findByDisplayValue('')).toBeTruthy();
    expect(screen.queryByDisplayValue('2:00 PM')).toBeNull();
  });

  it('keeps hand-edited wording when Change opens the people sheet on a draft resumed on Ready to send', async () => {
    // The name is not in the draft's fields yet, so a prefill on opening the sheet would set it and clear the wording.
    const draft = {
      step: 'review', templateCategory: 'aftercare', templateOverrideId: 'thank-you-note', fields: {},
      serviceDetailsKnown: null, selectedContactIds: ['c1'], includeFlowers: false, customFlorist: '',
      flowerDeliveryTarget: 'service', tone: 'plain', messageOverride: 'Our own words.',
    };
    await openMoment({ ...base, drafts: { aftercare: draft } } as unknown as Session, /Send thank-yous/);
    expect(await screen.findByDisplayValue('Our own words.')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: "Change who you're texting" }));
    await screen.findByRole('heading', { name: 'Who should get this?' });
    fireEvent.press(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Who should get this?' })).toBeNull());
    expect(screen.getByLabelText('Your message').props.value).toBe('Our own words.');
  });

  it('saves a service date typed on Confirm to the person', async () => {
    await openService({ ...base } as Session);
    await openPeople();
    await toConfirm();
    fireEvent.press(await screen.findByLabelText(/Service date/));
    fireEvent(screen.getByTestId('date-picker'), 'change', { type: 'set' }, new Date(2026, 6, 3));
    fireEvent.press(screen.getByRole('button', { name: 'Done' }));
    await waitFor(async () => {
      const [saved] = JSON.parse((await AsyncStorage.getItem(SESSIONS_KEY)) ?? '[]') as { serviceDate?: string }[];
      expect(saved?.serviceDate).toBe('July 3, 2026');
    });
  });

  it('leaves the saved service date alone when nothing is changed on Confirm', async () => {
    await openService({ ...base, serviceDate: 'June 14' } as Session);
    await openPeople();
    await toConfirm();
    expect((await screen.findByLabelText('Service date')).props.accessibilityValue.text).toBe('June 14');
    await new Promise((r) => setTimeout(r, 100));
    const [saved] = JSON.parse((await AsyncStorage.getItem(SESSIONS_KEY)) ?? '[]') as { serviceDate?: string }[];
    expect(saved?.serviceDate).toBe('June 14');
  });

  // The announcement has no intro (#671). Its first screen is the people step; the message still
  // carries the name and date from setup, and the saved name is never wiped by opening it.
  describe('the announcement without its intro (#671)', () => {
    it('carries the name and date of passing from setup to Ready to send, and keeps them saved', async () => {
      // A draft with no edited wording, so the message follows the name and date (a fresh form with web wording shows that wording).
      const draft = {
        step: 'contacts', templateCategory: 'announcement', templateOverrideId: null,
        fields: { personalNote: 'x' }, serviceDetailsKnown: null, selectedContactIds: [],
        includeFlowers: false, customFlorist: '', flowerDeliveryTarget: 'service', tone: 'plain', messageOverride: null,
      };
      await openMoment({ ...base, dateOfPassing: 'May 2, 2026', drafts: { announcement: draft } } as unknown as Session, /^Announce the passing, .*Continue$/, 'Anna, passed May 2, 2026');
      await openPeople();
      await toConfirm();
      expect(await screen.findByDisplayValue(/Anna passed away on May 2, 2026/)).toBeTruthy();
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
      expect(await openPeople()).toBeTruthy();
      expect(screen.queryByLabelText(/Anything you'd like to add/)).toBeNull();
      await toConfirm();
      expect(await screen.findByDisplayValue(/She was at peace\./)).toBeTruthy();
    });
  });
});

// #695: the thank-you's name starts from the signed-in account, on the phone only (DS-7).
describe('the thank-you name from the account (#695)', () => {
  const account = (over: Partial<NonNullable<typeof mockProfile>>) => ({ id: 'u1', senderName: '', contactSource: null, accountType: 'owner' as const, ...over });
  const thanksDraft = (fields: Record<string, string>, messageOverride: string | null) => ({
    step: 'review', templateCategory: 'aftercare', templateOverrideId: 'thank-you-note', fields,
    serviceDetailsKnown: null, selectedContactIds: ['c1'], includeFlowers: false, customFlorist: '',
    flowerDeliveryTarget: 'service', tone: 'plain', messageOverride,
  });
  // The label gains ", Needed" while the field is empty.
  const NAME_LABEL = /^Your name or family name/;
  // Resumed on Ready to send with no edited wording: the message follows the form, and the Details row is there.
  // (A fresh form with web wording starts from that wording and hides the row; with none it shows the nudge, #824.)
  const toThanks = async (session: Session = { ...base, drafts: { aftercare: thanksDraft({}, null) } } as unknown as Session) => {
    await openMoment(session, /Send thank-yous/);
    return screen.findByLabelText(NAME_LABEL);
  };
  type SavedSession = { senderName?: string; drafts?: { aftercare?: { fields?: Record<string, string> } } };
  const saved = async () => (JSON.parse((await AsyncStorage.getItem(SESSIONS_KEY)) ?? '[]') as SavedSession[])[0];
  // The draft is written after the form changes, so wait for the name to reach it.
  const waitForDraftName = (name: string) => waitFor(async () => expect((await saved())?.drafts?.aftercare?.fields?.['senderName']).toBe(name));

  it('fills the name from the account sender name', async () => {
    mockProfile = account({ senderName: 'The Hayes family', firstName: 'Sam' });
    expect((await toThanks()).props.value).toBe('The Hayes family');
  });

  it('falls back to the first name', async () => {
    mockProfile = account({ senderName: '', firstName: 'Sam' });
    expect((await toThanks()).props.value).toBe('Sam');
  });

  it('fills nothing with no account, and the message shows the blank', async () => {
    const field = await toThanks();
    expect(field.props.value ?? '').toBe('');
    expect(screen.getByDisplayValue(/______/)).toBeTruthy();
  });

  it('fills nothing when the account has no name', async () => {
    mockProfile = account({ senderName: '', firstName: null });
    expect(((await toThanks()).props.value ?? '')).toBe('');
  });

  it('stays editable', async () => {
    mockProfile = account({ senderName: 'Sam' });
    const field = await toThanks();
    fireEvent.changeText(field, 'The Hayes family');
    await waitFor(() => expect(screen.getByLabelText(NAME_LABEL).props.value).toBe('The Hayes family'));
  });

  it('never overwrites a name already typed in the draft', async () => {
    mockProfile = account({ senderName: 'Sam' });
    // Resumed on Ready to send with a person already picked, so the field is there without the people steps.
    await openMoment({ ...base, drafts: { aftercare: thanksDraft({ senderName: 'The Lee family' }, null) } } as unknown as Session, /Send thank-yous/);
    // The details row is closed once nothing is missing.
    fireEvent.press(await screen.findByRole('button', { name: 'Change details' }));
    expect((await screen.findByLabelText(NAME_LABEL)).props.value).toBe('The Lee family');
  });

  it('keeps a hand-edited message', async () => {
    mockProfile = account({ senderName: 'Sam' });
    await openMoment({ ...base, drafts: { aftercare: thanksDraft({}, 'Our own words.') } } as unknown as Session, /Send thank-yous/);
    expect(await screen.findByDisplayValue('Our own words.')).toBeTruthy();
    // The details row stays hidden while the wording is edited: the prefill did not touch the form.
    expect(screen.queryByRole('button', { name: 'Change details' })).toBeNull();
    expect(screen.queryByLabelText(NAME_LABEL)).toBeNull();
  });

  it('fills the name on a draft resumed on Ready to send, so sending is not blocked', async () => {
    mockProfile = account({ senderName: 'Sam' });
    await openMoment({ ...base, drafts: { aftercare: thanksDraft({}, null) } } as unknown as Session, /Send thank-yous/);
    // The row opens by itself at first (the name was empty), so the field is there without a press.
    expect((await screen.findByLabelText(NAME_LABEL)).props.value).toBe('Sam');
    const send = screen.getByRole('button', { name: /^Text 1 person/ });
    expect(send.props.accessibilityState?.disabled ?? false).toBe(false);
  });

  it('keeps the edited thank-you wording when the account fills the name', async () => {
    mockProfile = account({ senderName: 'Sam' });
    await openMoment({ ...base, thanksMessage: 'Thank you all.' } as Session, /Send thank-yous/);
    await openPeople();
    await toConfirm();
    expect(await screen.findByDisplayValue('Thank you all.')).toBeTruthy();
    // The details row is hidden while the wording is edited, so the saved draft shows the name went in.
    // Filling it must not have cleared the wording.
    await waitForDraftName('Sam');
    expect(screen.getByLabelText('Your message').props.value).toBe('Thank you all.');
  });

  it('does not write the account name to the person', async () => {
    mockProfile = account({ senderName: 'Sam' });
    await toThanks();
    await waitForDraftName('Sam');
    expect((await saved())?.senderName).toBe('');
  });
});
