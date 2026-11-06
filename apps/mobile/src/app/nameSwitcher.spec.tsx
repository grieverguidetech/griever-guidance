import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AccessibilityInfo } from 'react-native';
import { App } from './App';
import { ACTIVE_KEY, SESSIONS_KEY } from '../lib/useDeviceSessions';

const person = (id: string, personName: string, lastOpenedAt: string) => ({
  id, flowId: `flow-${id}`, ownerId: null, role: 'owner', personName, dateOfPassing: '', senderName: '', obituaryUrl: '',
  createdAt: lastOpenedAt, lastOpenedAt, drafts: {}, serviceReady: false, recipientsNotified: {}, momentCompletedAt: {}, remindersScheduled: [],
});

const seed = async (people: ReturnType<typeof person>[], active: string | null) => {
  await AsyncStorage.setItem(SESSIONS_KEY, JSON.stringify(people));
  if (active) {
    await AsyncStorage.setItem(ACTIVE_KEY, active);
  }
};

const say = () => jest.spyOn(AccessibilityInfo, 'announceForAccessibilityWithOptions').mockImplementation(() => undefined);

beforeEach(async () => {
  await AsyncStorage.setItem('gg.contacts.v1', JSON.stringify([{ contactId: 'c1', name: 'Dee', phone: '+15555550100', tier: 'family' }]));
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('the name switcher on the person screen', () => {
  it('with one person the name is plain text, and Add someone is in More', async () => {
    await seed([person('a', 'Anna', '2026-10-01T00:00:00.000Z')], 'a');
    say();
    render(<App />);
    await screen.findByText('For Anna');
    expect(screen.getByLabelText('Writing about Anna')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Writing about Anna' })).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: 'More' }));
    expect(await screen.findByRole('button', { name: 'Add someone' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Your account' })).toBeNull();
  });

  it('with two people the name is a button; picking the other opens their screen and says so once', async () => {
    await seed([person('a', 'Anna', '2026-10-01T00:00:00.000Z'), person('b', 'Ben', '2026-10-03T00:00:00.000Z')], 'b');
    const spoken = say();
    render(<App />);
    await screen.findByText('For Ben');
    // The launch said who is open; count only what the switch says.
    spoken.mockClear();
    fireEvent.press(screen.getByRole('button', { name: 'Writing about Ben' }));
    fireEvent.press(await screen.findByRole('button', { name: 'Anna' }));
    expect(await screen.findByText('For Anna')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Writing about Anna' })).toBeTruthy();
    expect(spoken).toHaveBeenCalledTimes(1);
    expect(spoken).toHaveBeenCalledWith('Now writing about Anna', { queue: true });
  });

  it('Add someone in the switcher leads to setup; Back returns to the person who was open', async () => {
    await seed([person('a', 'Anna', '2026-10-01T00:00:00.000Z'), person('b', 'Ben', '2026-10-03T00:00:00.000Z')], 'b');
    say();
    render(<App />);
    await screen.findByText('For Ben');
    fireEvent.press(screen.getByRole('button', { name: 'Writing about Ben' }));
    fireEvent.press(await screen.findByRole('button', { name: 'Add someone' }));
    expect(await screen.findByText('Who are we writing about?')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Back' }));
    expect(await screen.findByText('For Ben')).toBeTruthy();
    expect(screen.queryByText("Who you're writing about")).toBeNull();
  });

  it('a new person from Add someone goes through setup to their own screen', async () => {
    await seed([person('a', 'Anna', '2026-10-01T00:00:00.000Z'), person('b', 'Ben', '2026-10-03T00:00:00.000Z')], 'b');
    say();
    render(<App />);
    await screen.findByText('For Ben');
    fireEvent.press(screen.getByRole('button', { name: 'Writing about Ben' }));
    fireEvent.press(await screen.findByRole('button', { name: 'Add someone' }));
    fireEvent.changeText(await screen.findByLabelText('Their name, required'), 'Cora');
    fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByText('For Cora')).toBeTruthy();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Writing about Cora' })).toBeTruthy());
  });

  it('shows no Home button and offers no delete or remove', async () => {
    await seed([person('a', 'Anna', '2026-10-01T00:00:00.000Z'), person('b', 'Ben', '2026-10-03T00:00:00.000Z')], 'b');
    say();
    render(<App />);
    await screen.findByText('For Ben');
    expect(screen.queryByRole('button', { name: 'Home' })).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: 'More' }));
    await screen.findByRole('button', { name: 'Edit person' });
    expect(screen.queryByText(/delete|remove/i)).toBeNull();
  });
});
