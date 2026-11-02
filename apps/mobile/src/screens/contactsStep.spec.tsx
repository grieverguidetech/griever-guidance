import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { AccessibilityInfo, ActivityIndicator, AppState, BackHandler, Linking } from 'react-native';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Contact } from '@griever/shared';
import type { UseContactsResult } from '@griever/hooks';
import { screenCopy } from '@griever/copy';
import { App, CONTACTS_CHECK_FALLBACK_MS } from '../app/App';
import { SESSIONS_KEY, ACTIVE_KEY } from '../lib/useDeviceSessions';
import { mobileContactStore } from '../lib/contactStore';
import { ContactsStepScreen } from './ContactsStepScreen';

// Jest has no native view tree, so findNodeHandle returns null. A fake handle lets the test see focus sent.
jest.mock('react-native/Libraries/ReactNative/RendererProxy', () => ({
  ...jest.requireActual<object>('react-native/Libraries/ReactNative/RendererProxy'),
  findNodeHandle: (node: unknown) => node ?? null,
}));

const mockFetch = jest.fn<() => Promise<unknown[]>>();
const mockAvailable = jest.fn<() => Promise<boolean>>();
jest.mock('../lib/expoContactsSource', () => ({
  expoContactsSource: {
    id: 'native',
    preselected: false,
    isAvailable: () => mockAvailable(),
    fetch: () => mockFetch(),
  },
}));

const CONTACTS_TITLE = 'Who should we be able to reach?';
const PATH_TITLE = 'One thing at a time.';

const anna = {
  id: 'a', flowId: 'flow-a', ownerId: null, role: 'owner', personName: 'Anna', dateOfPassing: '', senderName: '',
  obituaryUrl: '', createdAt: '2026-10-01T00:00:00.000Z', lastOpenedAt: '2026-10-01T00:00:00.000Z',
  drafts: {}, serviceReady: false, recipientsNotified: {}, momentCompletedAt: {}, remindersScheduled: [],
};
const dee = { contactId: 'c1', name: 'Dee', phone: '+15555550100', tier: 'family' };

// The words inside a rendered node, to tell which button took focus.
const textOf = (node: unknown): string => {
  if (typeof node === 'string') {
    return node;
  }
  if (Array.isArray(node)) {
    return node.map(textOf).join('');
  }
  const props = (node as { props?: { children?: unknown } } | null)?.props;
  return props ? textOf(props.children) : '';
};

afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
  mockFetch.mockReset();
  mockAvailable.mockReset().mockResolvedValue(true);
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

  it('imports through the adapter, preselects nothing, adds only the one tapped, with no network', async () => {
    const fetchSpy = jest.spyOn(globalThis, 'fetch');
    mockFetch.mockResolvedValue([
      { key: 'x', displayName: 'Sam', phones: ['+16175550111'], emails: [], starred: true },
      { key: 'y', displayName: 'Pat', phones: ['+16175550112'], emails: [] },
    ]);
    const { contacts } = setup();
    fireEvent.press(screen.getByRole('button', { name: 'Bring in from my phone' }));
    fireEvent.press(await screen.findByLabelText('Pat, +16175550112'));
    expect(screen.getByText('1 chosen')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(contacts.importContacts).toHaveBeenCalled());
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [picked, source] = (contacts.importContacts as jest.Mock).mock.calls[0] as [{ name: string }[], string];
    expect(picked.map((c) => c.name)).toEqual(['Pat']);
    expect(fetchSpy).not.toHaveBeenCalled();
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

  it('Done for now is always available, as on web', () => {
    const { onContinue } = setup();
    fireEvent.press(screen.getByRole('button', { name: 'Done for now' }));
    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  it('says what was added, and shows a calm error if saving fails', async () => {
    const { contacts } = setup();
    fireEvent.press(screen.getByRole('button', { name: 'Add someone myself' }));
    fireEvent.press(screen.getByRole('button', { name: 'Add' }));
    expect((await screen.findByRole('alert')).props.children).toBe('Type a name and a mobile number.');
    (contacts.addContact as jest.Mock).mockImplementationOnce(() => Promise.reject(new Error('disk')));
    fireEvent.changeText(screen.getByLabelText('Name'), 'Dee');
    fireEvent.changeText(screen.getByLabelText('Mobile number'), '(617) 555-0148');
    fireEvent.press(screen.getByRole('button', { name: 'Add' }));
    expect((await screen.findByRole('alert')).props.children).toBe('We could not save that. Please try again.');
    fireEvent.press(screen.getByRole('button', { name: 'Add' }));
    expect(await screen.findByText('Added Dee')).toBeTruthy();
  });

  it('Done for now and Back call out with someone saved', () => {
    const { onContinue, onBack } = setup([dee as unknown as Contact]);
    fireEvent.press(screen.getByRole('button', { name: 'Done for now' }));
    expect(onContinue).toHaveBeenCalledTimes(1);
    fireEvent.press(screen.getByRole('button', { name: 'Back' }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});

describe('manual add keeps only the seven Contact fields and uses no network (C3, C4)', () => {
  it('stores exactly the Contact fields and never calls fetch', async () => {
    const fetchSpy = jest.spyOn(globalThis, 'fetch');
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
    fireEvent.press(await screen.findByRole('button', { name: 'Done for now' }));
    expect(await screen.findByText(PATH_TITLE)).toBeTruthy();
    expect(screen.getByText('For Ben')).toBeTruthy();
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
    fireEvent.press(screen.getByRole('button', { name: 'Back' }));
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

describe('ContactsStepScreen opened from Home (#379)', () => {
  const sam = { key: 'x', displayName: 'Sam', phones: ['+16175550111'], emails: [] };
  const mount = (list: Contact[] = [], loading = false) => {
    const contacts = {
      contacts: list,
      loading,
      addContact: jest.fn(async (c: unknown) => c),
      importContacts: jest.fn(async () => []),
    } as unknown as UseContactsResult;
    const onContinue = jest.fn();
    const onBack = jest.fn();
    const ui = (c: UseContactsResult) => <ContactsStepScreen contacts={c} onContinue={onContinue} onBack={onBack} startWithImport />;
    const view = render(ui(contacts));
    return { contacts, onContinue, onBack, view, ui };
  };

  it('Add leaves for Home (onContinue) after saving the chosen contact', async () => {
    mockFetch.mockResolvedValue([sam]);
    const { contacts, onContinue } = mount();
    fireEvent.press(await screen.findByRole('checkbox', { name: 'Sam, +16175550111' }));
    fireEvent.press(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(onContinue).toHaveBeenCalledTimes(1));
    expect(contacts.importContacts).toHaveBeenCalledTimes(1);
  });

  it('Back from the review returns Home (onBack)', async () => {
    mockFetch.mockResolvedValue([sam]);
    const { onBack } = mount();
    await screen.findByText('Sam');
    fireEvent.press(screen.getByRole('button', { name: 'Back' }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('a refused permission shows the start screen, and Back returns Home', async () => {
    const { Cancelled } = jest.requireActual<typeof import('@griever/contacts')>('@griever/contacts');
    mockFetch.mockRejectedValue(new Cancelled());
    const { onBack } = mount();
    expect(await screen.findByText(CONTACTS_TITLE)).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: 'Back' }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('a failed read shows the calm error, and Back returns Home', async () => {
    mockFetch.mockRejectedValue(new Error('boom'));
    const { onBack } = mount();
    expect((await screen.findByRole('alert')).props.children).toBe(
      'We could not read your contacts. You can add people by hand instead.',
    );
    fireEvent.press(screen.getByRole('button', { name: 'Back' }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('hardware back from the review returns Home', async () => {
    mockFetch.mockResolvedValue([sam]);
    let handler: (() => unknown) | undefined;
    jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_e, h) => {
      handler = h as () => unknown;
      return { remove: () => undefined };
    });
    const { onBack } = mount();
    await screen.findByText('Sam');
    act(() => {
      handler?.();
    });
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('waits for the saved list, so numbers already kept are not offered again', async () => {
    mockFetch.mockResolvedValue([sam, { key: 'y', displayName: 'Pat', phones: ['+16175550112'], emails: [] }]);
    const kept = [{ contactId: 'k', name: 'Sam', phone: '+16175550111', tier: 'family' }] as unknown as Contact[];
    const { contacts, view, ui } = mount([], true);
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(mockFetch).not.toHaveBeenCalled();
    view.rerender(ui({ ...contacts, contacts: kept, loading: false } as UseContactsResult));
    expect(await screen.findByText('Pat')).toBeTruthy();
    expect(screen.queryByText('Sam')).toBeNull();
  });
});

describe('ContactsStepScreen contacts never fail silently (#652)', () => {
  const copy = screenCopy('whoShouldKnow');
  const sam = { key: 'x', displayName: 'Sam', phones: ['+16175550111'], emails: [] };
  const pat = { key: 'y', displayName: 'Pat', phones: ['+16175550112'], emails: [] };
  const { Cancelled } = jest.requireActual<typeof import('@griever/contacts')>('@griever/contacts');
  const mount = (over: Partial<UseContactsResult> = {}, startWithImport = false) => {
    const contacts = {
      contacts: [],
      loading: false,
      addContact: jest.fn(async (c: unknown) => c),
      importContacts: jest.fn(async () => []),
      ...over,
    } as unknown as UseContactsResult;
    const onContinue = jest.fn();
    const onBack = jest.fn();
    render(<ContactsStepScreen contacts={contacts} onContinue={onContinue} onBack={onBack} startWithImport={startWithImport} />);
    return { contacts, onContinue, onBack };
  };

  it('refused for good: shows the calm line and Open Settings, which opens Settings', async () => {
    mockFetch.mockRejectedValue(new Cancelled('blocked'));
    const openSettings = jest.spyOn(Linking, 'openSettings').mockResolvedValue(undefined);
    mount();
    fireEvent.press(screen.getByRole('button', { name: 'Bring in from my phone' }));
    expect(await screen.findByText(copy.blockedLine)).toBeTruthy();
    // The import button stays, so a press can ask again.
    expect(screen.getByRole('button', { name: 'Bring in from my phone' })).toBeTruthy();
    // Adding by hand is still there.
    expect(screen.getByRole('button', { name: 'Add someone myself' })).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: copy.openSettings }));
    expect(openSettings).toHaveBeenCalledTimes(1);
  });

  it('refused for good: moves focus to the line itself, not Open Settings, and does not announce it separately', async () => {
    mockFetch.mockRejectedValue(new Cancelled('blocked'));
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => undefined);
    const focus = jest.spyOn(AccessibilityInfo, 'setAccessibilityFocus').mockImplementation(() => undefined);
    mount();
    focus.mockClear();
    fireEvent.press(screen.getByRole('button', { name: 'Bring in from my phone' }));
    await screen.findByText(copy.blockedLine);
    // The line is read by the focus move. A separate announcement would be cut off by it on iOS.
    expect(announce).not.toHaveBeenCalledWith(copy.blockedLine);
    expect(focus).toHaveBeenCalledTimes(1);
    // Focus went to the line (a text), and Open Settings is the next swipe.
    const target = focus.mock.calls[0]?.[0] as unknown as { props: { role?: string; children: unknown } };
    expect(target.props.role).not.toBe('button');
    expect(textOf(target.props.children)).toBe(copy.blockedLine);
  });

  it('pressing the import button again after a refusal asks again and goes on if allowed', async () => {
    mockFetch.mockRejectedValueOnce(new Cancelled('blocked')).mockResolvedValue([sam]);
    mount();
    fireEvent.press(screen.getByRole('button', { name: 'Bring in from my phone' }));
    await screen.findByText(copy.blockedLine);
    fireEvent.press(screen.getByRole('button', { name: 'Bring in from my phone' }));
    expect(await screen.findByText('Sam')).toBeTruthy();
  });

  it('coming back from Settings with contacts allowed clears the line and focuses the import button', async () => {
    mockFetch.mockRejectedValue(new Cancelled('blocked'));
    let onChange: (state: string) => void = () => undefined;
    jest.spyOn(AppState, 'addEventListener').mockImplementation(((_: string, cb: (state: string) => void) => {
      onChange = cb;
      return { remove: () => undefined };
    }) as never);
    const focus = jest.spyOn(AccessibilityInfo, 'setAccessibilityFocus').mockImplementation(() => undefined);
    mount();
    fireEvent.press(screen.getByRole('button', { name: 'Bring in from my phone' }));
    await screen.findByText(copy.blockedLine);
    // Still refused: nothing changes.
    mockAvailable.mockResolvedValue(false);
    await act(async () => {
      onChange('active');
    });
    expect(screen.getByText(copy.blockedLine)).toBeTruthy();
    mockAvailable.mockResolvedValue(true);
    focus.mockClear();
    await act(async () => {
      onChange('active');
    });
    await waitFor(() => expect(screen.queryByText(copy.blockedLine)).toBeNull());
    expect(screen.queryByRole('button', { name: copy.openSettings })).toBeNull();
    expect(focus).toHaveBeenCalledTimes(1);
    expect(textOf((focus.mock.calls[0]?.[0] as unknown as { props: { children: unknown } }).props.children)).toBe('Bring in from my phone');
  });

  it('refused for good on the Home import path shows the same line and button', async () => {
    mockFetch.mockRejectedValue(new Cancelled('blocked'));
    mount({}, true);
    expect(await screen.findByText(copy.blockedLine)).toBeTruthy();
    expect(screen.getByRole('button', { name: copy.openSettings })).toBeTruthy();
  });

  it('a refusal the system can ask about again shows no line', async () => {
    mockFetch.mockRejectedValue(new Cancelled('denied'));
    mount();
    fireEvent.press(screen.getByRole('button', { name: 'Bring in from my phone' }));
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole('button', { name: 'Bring in from my phone' })).toBeTruthy();
    expect(screen.queryByText(copy.blockedLine)).toBeNull();
  });

  it('shows a spinner and "Reading your contacts…" while reading, and a second tap reads once', async () => {
    let finish: (value: unknown[]) => void = () => undefined;
    mockFetch.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    mount();
    fireEvent.press(screen.getByRole('button', { name: 'Bring in from my phone' }));
    const busy = await screen.findByRole('button', { name: copy.bringAcrossBusy });
    expect(busy.props.accessibilityState).toEqual(expect.objectContaining({ busy: true }));
    expect(screen.UNSAFE_queryByType(ActivityIndicator)).toBeTruthy();
    fireEvent.press(busy);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    await act(async () => {
      finish([]);
    });
  });

  it('adds by hand once on a double tap, and Add reads as saving', async () => {
    let finish: (value: unknown) => void = () => undefined;
    const addContact = jest.fn(() => new Promise((resolve) => { finish = resolve; }));
    mount({ addContact } as never);
    fireEvent.press(screen.getByRole('button', { name: 'Add someone myself' }));
    fireEvent.changeText(screen.getByLabelText('Name'), 'Dee');
    fireEvent.changeText(screen.getByLabelText('Mobile number'), '(617) 555-0148');
    const add = screen.getByRole('button', { name: 'Add' });
    fireEvent.press(add);
    fireEvent.press(add);
    expect(addContact).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: copy.saving })).toBeTruthy();
    await act(async () => {
      finish({});
    });
    expect(await screen.findByText('Added Dee')).toBeTruthy();
  });

  it('keeps the typed name and number when saving fails', async () => {
    const addContact = jest.fn(async () => {
      throw new Error('disk');
    });
    mount({ addContact } as never);
    fireEvent.press(screen.getByRole('button', { name: 'Add someone myself' }));
    fireEvent.changeText(screen.getByLabelText('Name'), 'Dee');
    fireEvent.changeText(screen.getByLabelText('Mobile number'), '(617) 555-0148');
    fireEvent.press(screen.getByRole('button', { name: 'Add' }));
    expect((await screen.findByRole('alert')).props.children).toBe(copy.saveFailed);
    expect(screen.getByLabelText('Name').props.value).toBe('Dee');
    expect(screen.getByLabelText('Mobile number').props.value).toBe('(617) 555-0148');
    expect(screen.getByRole('button', { name: 'Add' })).toBeTruthy();
  });

  it('review: Add uses the shared button, reads as unavailable with a hint, and has no faded style', async () => {
    mockFetch.mockResolvedValue([sam]);
    mount();
    fireEvent.press(screen.getByRole('button', { name: 'Bring in from my phone' }));
    await screen.findByText('Sam');
    const add = screen.getByRole('button', { name: 'Add' });
    expect(add.props.accessibilityState).toEqual(expect.objectContaining({ disabled: true }));
    expect(add.props.accessibilityHint).toBe(copy.chooseOne);
    // The reason is also on screen as text.
    expect(screen.getByText(copy.chooseOne)).toBeTruthy();
    expect(JSON.stringify(add.props.style)).not.toContain('"opacity":0.4');
  });

  it('review: searches by name and saves once on a double tap', async () => {
    mockFetch.mockResolvedValue([sam, pat]);
    let finish: (value: unknown[]) => void = () => undefined;
    const importContacts = jest.fn(() => new Promise<unknown[]>((resolve) => { finish = resolve; }));
    mount({ importContacts } as never);
    fireEvent.press(screen.getByRole('button', { name: 'Bring in from my phone' }));
    await screen.findByText('Sam');
    fireEvent.changeText(screen.getByLabelText(copy.searchLabel), 'pat');
    expect(screen.queryByText('Sam')).toBeNull();
    fireEvent.changeText(screen.getByLabelText(copy.searchLabel), 'zzz');
    expect(screen.getByText(copy.searchEmpty)).toBeTruthy();
    expect(screen.getByText(copy.searchEmpty).props.accessibilityLiveRegion).toBe('polite');
    fireEvent.changeText(screen.getByLabelText(copy.searchLabel), 'pat');
    fireEvent.press(screen.getByRole('checkbox', { name: 'Pat, +16175550112' }));
    const add = screen.getByRole('button', { name: 'Add' });
    fireEvent.press(add);
    fireEvent.press(add);
    expect(importContacts).toHaveBeenCalledTimes(1);
    await act(async () => {
      finish([]);
    });
  });

  it('review: a failed save shows the error and keeps the ticks', async () => {
    mockFetch.mockResolvedValue([sam]);
    const importContacts = jest.fn(async () => {
      throw new Error('disk');
    });
    mount({ importContacts } as never);
    fireEvent.press(screen.getByRole('button', { name: 'Bring in from my phone' }));
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => undefined);
    fireEvent.press(await screen.findByRole('checkbox', { name: 'Sam, +16175550111' }));
    fireEvent.press(screen.getByRole('button', { name: 'Add' }));
    expect((await screen.findByRole('alert')).props.children).toBe(copy.saveFailed);
    expect(announce).toHaveBeenCalledWith(copy.saveFailed);
    expect(screen.getByText('1 chosen')).toBeTruthy();
  });

  it('after a successful import the last button reads Continue instead of Done for now', async () => {
    mockFetch.mockResolvedValue([sam]);
    const { onContinue } = mount();
    expect(screen.getByRole('button', { name: copy.doneForNow })).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Bring in from my phone' }));
    fireEvent.press(await screen.findByRole('checkbox', { name: 'Sam, +16175550111' }));
    fireEvent.press(screen.getByRole('button', { name: 'Add' }));
    fireEvent.press(await screen.findByRole('button', { name: copy.continue }));
    expect(screen.queryByRole('button', { name: copy.doneForNow })).toBeNull();
    expect(onContinue).toHaveBeenCalledTimes(1);
  });
});
