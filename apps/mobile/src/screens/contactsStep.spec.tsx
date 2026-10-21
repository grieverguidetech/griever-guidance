import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Contact } from '@griever/shared';
import type { UseContactsResult } from '@griever/hooks';
import { App, CONTACTS_CHECK_FALLBACK_MS } from '../app/App';
import { SESSIONS_KEY, ACTIVE_KEY } from '../lib/useDeviceSessions';
import { mobileContactStore } from '../lib/contactStore';
import { ContactsStepScreen } from './ContactsStepScreen';

const mockFetch = jest.fn<() => Promise<unknown[]>>();
jest.mock('../lib/expoContactsSource', () => ({
  expoContactsSource: {
    id: 'native',
    preselected: false,
    isAvailable: async () => true,
    fetch: () => mockFetch(),
  },
}));

const CONTACTS_TITLE = 'Who should we be able to reach?';
const PATH_TITLE = 'Choose the type of message you would like to send.';

const anna = {
  id: 'a', flowId: 'flow-a', ownerId: null, role: 'owner', personName: 'Anna', dateOfPassing: '', senderName: '',
  obituaryUrl: '', createdAt: '2026-10-01T00:00:00.000Z', lastOpenedAt: '2026-10-01T00:00:00.000Z',
  drafts: {}, serviceReady: false, recipientsNotified: {}, momentCompletedAt: {}, remindersScheduled: [],
};
const dee = { contactId: 'c1', name: 'Dee', phone: '+15555550100', tier: 'family' };

afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
  mockFetch.mockReset();
});

// Home -> Create -> setup -> Continue.
async function createBen() {
  fireEvent.press(await screen.findByText("Someone else I've lost"));
  fireEvent.changeText(await screen.findByLabelText('Their name, required'), 'Ben');
  fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
}

const seed = async (contacts: unknown[]) => {
  await AsyncStorage.setItem(SESSIONS_KEY, JSON.stringify([anna]));
  await AsyncStorage.setItem(ACTIVE_KEY, 'a');
  if (contacts.length) await AsyncStorage.setItem('gg.contacts.v1', JSON.stringify(contacts));
};

describe('ContactsStepScreen', () => {
  const setup = (list: Contact[] = []) => {
    const contacts = {
      contacts: list,
      loading: false,
      addContact: jest.fn(async (c: unknown) => c),
      importContacts: jest.fn(async () => []),
    } as unknown as UseContactsResult;
    const onContinue = jest.fn();
    const onBack = jest.fn();
    render(<ContactsStepScreen contacts={contacts} onContinue={onContinue} onBack={onBack} />);
    return { contacts, onContinue, onBack };
  };

  it('imports through the adapter, never expo-contacts directly, and adds only the ones chosen', async () => {
    mockFetch.mockResolvedValue([
      { key: 'x', displayName: 'Sam', phones: ['+16175550111'], emails: [], starred: true },
      { key: 'y', displayName: 'Pat', phones: ['+16175550112'], emails: [] },
    ]);
    const { contacts } = setup();
    fireEvent.press(screen.getByRole('button', { name: 'Bring in from my phone' }));
    fireEvent.press(await screen.findByLabelText('Pat, +16175550112'));
    fireEvent.press(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(contacts.importContacts).toHaveBeenCalled());
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [picked, source] = (contacts.importContacts as jest.Mock).mock.calls[0] as [{ name: string }[], string];
    expect(picked.map((c) => c.name)).toEqual(['Sam', 'Pat']);
    expect(source).toBe('native');
  });

  it('a refused permission is not an error', async () => {
    const { Cancelled } = jest.requireActual<typeof import('@griever/contacts')>('@griever/contacts');
    mockFetch.mockRejectedValue(new Cancelled());
    setup();
    fireEvent.press(screen.getByRole('button', { name: 'Bring in from my phone' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Bring in from my phone' })).toBeTruthy());
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('adds by hand with a valid number and rejects a bad one', async () => {
    const { contacts } = setup();
    fireEvent.press(screen.getByRole('button', { name: 'Add someone myself' }));
    fireEvent.changeText(screen.getByLabelText('Name'), ' Aunt Carol ');
    fireEvent.changeText(screen.getByLabelText('Mobile number'), '12');
    fireEvent.press(screen.getByRole('button', { name: 'Add' }));
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(contacts.addContact).not.toHaveBeenCalled();
    fireEvent.changeText(screen.getByLabelText('Mobile number'), '(617) 555-0148');
    fireEvent.press(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(contacts.addContact).toHaveBeenCalledWith({ name: 'Aunt Carol', phone: '+16175550148', tier: 'family' }));
  });

  it('keeps Continue off until someone is saved, then continues', () => {
    const first = setup();
    expect(screen.getByRole('button', { name: 'Continue' }).props.accessibilityState.disabled).toBe(true);
    fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    expect(first.onContinue).not.toHaveBeenCalled();
  });

  it('Continue and Back call out once someone is saved', () => {
    const { onContinue, onBack } = setup([dee as unknown as Contact]);
    fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    expect(onContinue).toHaveBeenCalledTimes(1);
    fireEvent.press(screen.getByLabelText('Back'));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});

describe('manual add keeps only the seven Contact fields and uses no network (C3, C4)', () => {
  it('stores exactly the Contact fields and never calls fetch', async () => {
    const fetchSpy = jest.fn();
    (globalThis as unknown as { fetch: unknown }).fetch = fetchSpy;
    await seed([]);
    render(<App />);
    await createBen();
    fireEvent.press(await screen.findByRole('button', { name: 'Add someone myself' }));
    fireEvent.changeText(screen.getByLabelText('Name'), 'Aunt Carol');
    fireEvent.changeText(screen.getByLabelText('Mobile number'), '(617) 555-0148');
    fireEvent.press(screen.getByRole('button', { name: 'Add' }));
    await screen.findByText('Added so far — 1');
    const stored = await mobileContactStore.list();
    expect(stored).toHaveLength(1);
    expect(Object.keys(stored[0]).sort()).toEqual(
      ['contactId', 'createdAt', 'email', 'name', 'phone', 'source', 'tier'],
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('the contacts step in the app', () => {
  it('shows the step when the store is empty, then goes on to the path', async () => {
    await seed([]);
    render(<App />);
    await createBen();
    expect(await screen.findByText(CONTACTS_TITLE)).toBeTruthy();
    expect(screen.queryByText(PATH_TITLE)).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: 'Add someone myself' }));
    fireEvent.changeText(screen.getByLabelText('Name'), 'Aunt Carol');
    fireEvent.changeText(screen.getByLabelText('Mobile number'), '(617) 555-0148');
    fireEvent.press(screen.getByRole('button', { name: 'Add' }));
    fireEvent.press(await screen.findByRole('button', { name: 'Continue' }));
    expect(await screen.findByText(PATH_TITLE)).toBeTruthy();
    expect(screen.getByText('Writing about Ben')).toBeTruthy();
  });

  it('skips the step when the store already has contacts', async () => {
    await seed([dee]);
    render(<App />);
    await createBen();
    expect(await screen.findByText(PATH_TITLE)).toBeTruthy();
    expect(screen.queryByText(CONTACTS_TITLE)).toBeNull();
  });

  it('Back returns to setup with the name kept', async () => {
    await seed([]);
    render(<App />);
    await createBen();
    await screen.findByText(CONTACTS_TITLE);
    fireEvent.press(screen.getByLabelText('Back'));
    expect((await screen.findByLabelText('Their name, required')).props.value).toBe('Ben');
  });

  it('carries on as if there are none when the local read is slow', async () => {
    await seed([]);
    jest.spyOn(mobileContactStore, 'list').mockImplementation(() => new Promise(() => undefined));
    render(<App />);
    await createBen();
    expect(await screen.findByText('Opening…')).toBeTruthy();
    expect(screen.queryByText(CONTACTS_TITLE)).toBeNull();
    expect(await screen.findByText(CONTACTS_TITLE, {}, { timeout: CONTACTS_CHECK_FALLBACK_MS + 2000 })).toBeTruthy();
  });
});
