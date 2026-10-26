import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { BackHandler } from 'react-native';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Session } from '@griever/hooks';
import { App } from './App';
import { HomeScreen } from '../screens/HomeScreen';
import { SESSIONS_KEY, ACTIVE_KEY } from '../lib/useDeviceSessions';

const person = (id: string, personName: string, lastOpenedAt: string, dateOfPassing = ''): Session =>
  ({
    id, flowId: `flow-${id}`, ownerId: null, role: 'owner', personName, dateOfPassing, senderName: '', obituaryUrl: '', createdAt: lastOpenedAt, lastOpenedAt,
    drafts: {}, serviceReady: false, recipientsNotified: {}, momentCompletedAt: {}, remindersScheduled: [],
  }) as Session;

const noop = () => undefined;
const props = { canCreate: true, onOpen: noop, onCreate: noop, onWhatYoullNeed: noop };

describe('HomeScreen', () => {
  it('lists people newest first with the date of passing, and leaves out the unnamed', () => {
    const sessions = [
      person('a', 'Anna', '2026-10-01T00:00:00.000Z', 'May 2, 2026'),
      person('b', 'Ben', '2026-10-03T00:00:00.000Z'),
      person('c', '', '2026-10-05T00:00:00.000Z'),
    ];
    render(<HomeScreen {...props} sessions={sessions} />);
    const rows = screen.getAllByRole('button').map((b) => b.props.accessibilityLabel ?? '');
    expect(rows.filter((l) => l === 'Ben' || l.startsWith('Anna'))).toEqual(['Ben', 'Anna, passed May 2, 2026']);
    expect(screen.getByText('May 2, 2026')).toBeTruthy();
    expect(screen.queryByText('Someone new')).toBeNull();
  });

  it('opens the person that was pressed', () => {
    const onOpen = jest.fn();
    render(<HomeScreen {...props} onOpen={onOpen} sessions={[person('a', 'Anna', '2026-10-01T00:00:00.000Z')]} />);
    fireEvent.press(screen.getByLabelText('Anna'));
    expect(onOpen).toHaveBeenCalledWith('a');
  });

  it('puts What you\'ll need first, and offers a first start when there are no people', () => {
    render(<HomeScreen {...props} sessions={[]} />);
    expect(screen.getByText("What you'll need")).toBeTruthy();
    expect(screen.getByText("Start with someone I've lost")).toBeTruthy();
    expect(screen.queryByText("Someone else I've lost")).toBeNull();
  });

  it('offers "Someone else" once there are people', () => {
    render(<HomeScreen {...props} sessions={[person('a', 'Anna', '2026-10-01T00:00:00.000Z')]} />);
    expect(screen.getByText("Someone else I've lost")).toBeTruthy();
    expect(screen.queryByText("Start with someone I've lost")).toBeNull();
  });

  it('hides creating when canCreate is false but still opens people', () => {
    render(<HomeScreen {...props} canCreate={false} sessions={[person('a', 'Anna', '2026-10-01T00:00:00.000Z')]} />);
    expect(screen.queryByText("Someone else I've lost")).toBeNull();
    expect(screen.queryByText("Start with someone I've lost")).toBeNull();
    expect(screen.getByLabelText('Anna')).toBeTruthy();
  });
});

describe('the order in the app', () => {
  const saved = async (sessions: Session[], contacts: unknown[] = []) => {
    await AsyncStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
    await AsyncStorage.setItem(ACTIVE_KEY, sessions[0]?.id ?? '');
    if (contacts.length) await AsyncStorage.setItem('gg.contacts.v1', JSON.stringify(contacts));
  };

  it('lands on Home on every launch, even with a person already open', async () => {
    await saved([person('a', 'Anna', '2026-10-01T00:00:00.000Z')]);
    render(<App />);
    expect(await screen.findByLabelText('Anna')).toBeTruthy();
    expect(screen.queryByText('Choose the type of message you would like to send.')).toBeNull();
  });

  // Behavior change approved in #110 (replaces "goes from Create straight to the path"):
  // Create now opens setup first, and Continue leads to the path.
  // With no saved contacts the contacts step comes between (#226); see contactsStep.spec.tsx.
  it('goes from Create to setup, then to the path, when contacts are already saved', async () => {
    const contact = { contactId: 'c1', name: 'Dee', phone: '+15555550100', tier: 'family' };
    await saved([person('a', 'Anna', '2026-10-01T00:00:00.000Z')], [contact]);
    const view = render(<App />);
    fireEvent.press(await screen.findByText("Someone else I've lost"));
    expect(await screen.findByText('Who are we writing about?')).toBeTruthy();
    expect(screen.queryByText('Choose the type of message you would like to send.')).toBeNull();
    fireEvent.changeText(screen.getByLabelText('Their name, required'), 'Ben');
    fireEvent.changeText(screen.getByLabelText('Date of passing'), 'June 7, 2025');
    fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByText('One thing at a time.')).toBeTruthy();
    expect(screen.getByText('For Ben')).toBeTruthy();
    expect(screen.queryByText('Choose who to tell')).toBeNull();
    view.unmount();
  });

  it('Back from setup returns to Home and the new person is not listed', async () => {
    await saved([person('a', 'Anna', '2026-10-01T00:00:00.000Z')]);
    render(<App />);
    fireEvent.press(await screen.findByText("Someone else I've lost"));
    await screen.findByText('Who are we writing about?');
    fireEvent.press(screen.getByLabelText('Back to home'));
    expect(await screen.findByText("Who you're writing about")).toBeTruthy();
    expect(screen.queryByLabelText('Someone new')).toBeNull();
    expect(screen.getByLabelText('Anna')).toBeTruthy();
  });

  it('opening an existing person skips setup', async () => {
    await saved([person('a', 'Anna', '2026-10-01T00:00:00.000Z')]);
    render(<App />);
    fireEvent.press(await screen.findByLabelText('Anna'));
    expect(await screen.findByText('One thing at a time.')).toBeTruthy();
    expect(screen.queryByText('Who are we writing about?')).toBeNull();
  });

  it('asks nothing about the name or date again on the announcement form', async () => {
    await saved([person('a', 'Anna', '2026-10-01T00:00:00.000Z', 'May 2, 2026')]);
    render(<App />);
    fireEvent.press(await screen.findByLabelText('Anna, passed May 2, 2026'));
    fireEvent.press(await screen.findByRole('button', { name: 'Start' }));
    await screen.findByPlaceholderText('She was peaceful, and we were with her.');
    expect(screen.queryByPlaceholderText('e.g. Margaret Ellen Hayes')).toBeNull();
    expect(screen.queryByPlaceholderText('e.g. June 7, 2025')).toBeNull();
  });

  it('opens the details form with the name from setup already filled', async () => {
    await saved([person('a', 'Anna', '2026-10-01T00:00:00.000Z')], [{ contactId: 'c1', name: 'Dee', phone: '+15555550100', tier: 'family' }]);
    render(<App />);
    fireEvent.press(await screen.findByText("Someone else I've lost"));
    await screen.findByText('Who are we writing about?');
    fireEvent.changeText(screen.getByLabelText('Their name, required'), 'Ben Cole');
    fireEvent.changeText(screen.getByLabelText('Date of passing'), 'June 7, 2025');
    fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    await screen.findByText('One thing at a time.');
    fireEvent.press(screen.getByRole('button', { name: /Send thank-yous/ }));
    await waitFor(async () =>
      expect((await screen.findByPlaceholderText('e.g. Margaret Ellen Hayes')).props.value).toBe('Ben Cole'),
    );
    // The date is kept on the person; this moment's form has no date field, the message reads it from them.
    const kept = JSON.parse((await AsyncStorage.getItem(SESSIONS_KEY)) ?? "[]") as { personName: string; dateOfPassing: string }[];
    expect(kept.find((p) => p.personName === "Ben Cole")?.dateOfPassing).toBe('June 7, 2025');
  });

  it('returns to Home from the path with the person listed', async () => {
    await saved([person('a', 'Anna', '2026-10-01T00:00:00.000Z')]);
    render(<App />);
    fireEvent.press(await screen.findByLabelText('Anna'));
    await screen.findByText('One thing at a time.');
    fireEvent.press(screen.getByRole('button', { name: 'Back' }));
    expect(await screen.findByLabelText('Anna')).toBeTruthy();
    expect(screen.getByText("Someone else I've lost")).toBeTruthy();
  });

  it('opens a draft in progress where it was left when the person is opened from Home', async () => {
    const draft = {
      step: 'details', templateCategory: 'aftercare', templateOverrideId: null, fields: { deceasedName: 'Anna Lee' },
      serviceDetailsKnown: null, selectedContactIds: [], includeFlowers: false,
      customFlorist: '', flowerDeliveryTarget: 'service', tone: 'warm', messageOverride: null,
    };
    await saved([{ ...person('a', 'Anna', '2026-10-01T00:00:00.000Z'), drafts: { aftercare: draft } } as unknown as Session]);
    render(<App />);
    fireEvent.press(await screen.findByLabelText('Anna'));
    fireEvent.press(await screen.findByRole('button', { name: /Send thank-yous/ }));
    await waitFor(async () =>
      expect((await screen.findByPlaceholderText('e.g. Margaret Ellen Hayes')).props.value).toBe('Anna Lee'),
    );
  });
});

const draftOf = (fields: Record<string, string>, step = 'details') => ({
  step, templateCategory: 'aftercare', templateOverrideId: null, fields,
  serviceDetailsKnown: null, selectedContactIds: [], includeFlowers: false,
  customFlorist: '', flowerDeliveryTarget: 'service', tone: 'warm', messageOverride: null,
});

describe('Home from every step', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('goes Home from a resumed details step', async () => {
    const anna = { ...person('a', 'Anna', '2026-10-01T00:00:00.000Z'), drafts: { aftercare: draftOf({ deceasedName: 'Anna' }) } };
    await AsyncStorage.setItem(SESSIONS_KEY, JSON.stringify([anna]));
    render(<App />);
    fireEvent.press(await screen.findByLabelText('Anna'));
    fireEvent.press(await screen.findByRole('button', { name: /Send thank-yous/ }));
    await screen.findByPlaceholderText('e.g. Margaret Ellen Hayes');
    // No Home bar (#364): Back from the first form goes to the hub, and Back there goes Home.
    expect(screen.queryByLabelText('Back to home')).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: 'Back' }));
    await screen.findByText('One thing at a time.');
    fireEvent.press(screen.getByRole('button', { name: 'Back' }));
    expect(await screen.findByText("Who you're writing about")).toBeTruthy();
  });

  it('Android back: the hub goes Home; a first form goes to the hub; a later step goes Home', async () => {
    const handlers: (() => boolean)[] = [];
    jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_e, h) => {
      handlers.push(h as () => boolean);
      return { remove: () => void handlers.splice(handlers.indexOf(h as () => boolean), 1) };
    });
    // Like React Native: newest handler first, stop at the first that handles it.
    const pressBack = () => [...handlers].reverse().some((h) => h());
    await AsyncStorage.setItem(SESSIONS_KEY, JSON.stringify([person('a', 'Anna', '2026-10-01T00:00:00.000Z')]));
    await AsyncStorage.setItem('gg.contacts.v1', JSON.stringify([{ contactId: 'c1', name: 'Dee', phone: '+15555550100', tier: 'family' }]));
    render(<App />);
    fireEvent.press(await screen.findByLabelText('Anna'));
    await screen.findByText('One thing at a time.');
    act(() => void pressBack());
    expect(await screen.findByText("Who you're writing about")).toBeTruthy();

    // The first form: Android back is the same as the on-screen Back, to the hub.
    fireEvent.press(await screen.findByLabelText('Anna'));
    fireEvent.press(await screen.findByRole('button', { name: 'Start' }));
    await screen.findByPlaceholderText('She was peaceful, and we were with her.');
    act(() => void pressBack());
    expect(await screen.findByText('One thing at a time.')).toBeTruthy();

    // A later step still goes Home.
    fireEvent.press(await screen.findByRole('button', { name: 'Start' }));
    await screen.findByPlaceholderText('She was peaceful, and we were with her.');
    fireEvent.press(await screen.findByText('Continue'));
    await screen.findByText('Who should know?');
    act(() => void pressBack());
    expect(await screen.findByText("Who you're writing about")).toBeTruthy();
  });
});

describe('Home without the checklist link (accounts on)', () => {
  it('shows no What you\'ll need link when none is given, and keeps Your account', () => {
    render(<HomeScreen canCreate onOpen={noop} onCreate={noop} onAccount={noop} sessions={[]} />);
    expect(screen.queryByText("What you'll need")).toBeNull();
    expect(screen.getByText('Your account')).toBeTruthy();
  });
});

describe('people who would otherwise be hidden', () => {
  it('lists an unnamed person with a draft as "Someone new"', () => {
    const unnamed = { ...person('u', '', '2026-10-01T00:00:00.000Z'), drafts: { aftercare: draftOf({}) } };
    render(<HomeScreen {...props} sessions={[unnamed as unknown as Session]} />);
    expect(screen.getByLabelText('Someone new')).toBeTruthy();
  });

  it('"Someone else" reuses a blank person even when another person is open', async () => {
    const anna = person('a', 'Anna', '2026-10-02T00:00:00.000Z');
    const blank = person('b', '', '2026-10-01T00:00:00.000Z');
    await AsyncStorage.setItem(SESSIONS_KEY, JSON.stringify([anna, blank]));
    await AsyncStorage.setItem(ACTIVE_KEY, 'a');
    render(<App />);
    fireEvent.press(await screen.findByText("Someone else I've lost"));
    await screen.findByText('Who are we writing about?');
    const stored = JSON.parse((await AsyncStorage.getItem(SESSIONS_KEY)) ?? '[]') as { id: string }[];
    expect(stored.map((p) => p.id).sort()).toEqual(['a', 'b']);
  });
});
