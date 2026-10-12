import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Session } from '@griever/hooks';
import { App } from './App';
import { HomeScreen } from '../screens/HomeScreen';
import { SESSIONS_KEY, ACTIVE_KEY } from '../lib/useDeviceSessions';

const person = (id: string, personName: string, lastOpenedAt: string, dateOfPassing = ''): Session =>
  ({
    id, personName, dateOfPassing, senderName: '', obituaryUrl: '', createdAt: lastOpenedAt, lastOpenedAt,
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
    expect(rows.filter((l) => l === 'Ben' || l.startsWith('Anna'))).toEqual(['Ben', 'Anna, May 2, 2026']);
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

  it('goes from Create straight to the path, with or without saved contacts', async () => {
    const contact = { contactId: 'c1', name: 'Dee', phone: '+15555550100', tier: 'family' };
    for (const contacts of [[], [contact]]) {
      await saved([person('a', 'Anna', '2026-10-01T00:00:00.000Z')], contacts);
      const view = render(<App />);
      fireEvent.press(await screen.findByText("Someone else I've lost"));
      expect(await screen.findByText('Choose the type of message you would like to send.')).toBeTruthy();
      expect(screen.queryByText('Choose who to tell')).toBeNull();
      view.unmount();
    }
  });

  it('returns to Home from the path with the person listed', async () => {
    await saved([person('a', 'Anna', '2026-10-01T00:00:00.000Z')]);
    render(<App />);
    fireEvent.press(await screen.findByLabelText('Anna'));
    await screen.findByText('Writing about Anna');
    fireEvent.press(screen.getByLabelText('Back to home'));
    expect(await screen.findByLabelText('Anna')).toBeTruthy();
    expect(screen.getByText("Someone else I've lost")).toBeTruthy();
  });

  it('opens a draft in progress where it was left when the person is opened from Home', async () => {
    const draft = {
      step: 'details', templateCategory: 'aftercare', templateOverrideId: null, fields: { deceasedName: 'Anna Lee' },
      serviceDetailsKnown: null, selectedContactIds: [], place: null, includeFlowers: false, floristId: null,
      customFlorist: '', flowerDeliveryTarget: 'service', tone: 'warm', messageOverride: null,
    };
    await saved([{ ...person('a', 'Anna', '2026-10-01T00:00:00.000Z'), drafts: { aftercare: draft } } as unknown as Session]);
    render(<App />);
    fireEvent.press(await screen.findByLabelText('Anna'));
    await waitFor(async () =>
      expect((await screen.findByPlaceholderText('e.g. Margaret Ellen Hayes')).props.value).toBe('Anna Lee'),
    );
  });
});
