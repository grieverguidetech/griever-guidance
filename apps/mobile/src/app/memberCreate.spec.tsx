import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ACTIVE_KEY, SESSIONS_KEY } from '../lib/useDeviceSessions';
import { ADD_PERSON, START_FIRST } from '../screens/HomeScreen';

// Only the account is mocked: the real App decides what to show from useAccount().profile.accountType.
let mockAccount: { profile: { accountType: string } | null } | null = null;
jest.mock('../lib/AccountProvider', () => ({
  ...jest.requireActual<object>('../lib/AccountProvider'),
  useAccount: () => mockAccount,
}));
import { App } from './App';

const anna = {
  id: 'a', flowId: 'flow-a', ownerId: null, role: 'owner', personName: 'Anna', dateOfPassing: '', senderName: '', obituaryUrl: '',
  createdAt: '2026-10-01T00:00:00.000Z', lastOpenedAt: '2026-10-01T00:00:00.000Z', drafts: {}, serviceReady: false,
  recipientsNotified: {}, momentCompletedAt: {}, remindersScheduled: [],
};
const MEMBER_EMPTY = "When someone adds you to help, the people you're helping will show here.";

beforeEach(async () => {
  await AsyncStorage.setItem('gg.contacts.v1', JSON.stringify([{ contactId: 'c1', name: 'Dee', phone: '+15555550100', tier: 'family' }]));
});

describe('creating a person on the phone (C11)', () => {
  it('a member with no people sees the member line on Home and no start button', async () => {
    mockAccount = { profile: { accountType: 'member' } };
    render(<App />);
    expect(await screen.findByText(MEMBER_EMPTY)).toBeTruthy();
    expect(screen.queryByText(START_FIRST)).toBeNull();
  });

  it('a member has no Add someone in the switcher, no Home create button, and can still open a person', async () => {
    mockAccount = { profile: { accountType: 'member' } };
    await AsyncStorage.setItem(SESSIONS_KEY, JSON.stringify([anna]));
    render(<App />);
    fireEvent.press(await screen.findByLabelText('Anna'));
    await screen.findByText('For Anna');
    fireEvent.press(screen.getByRole('button', { name: 'Writing about Anna' }));
    expect(await screen.findByRole('button', { name: 'Edit person' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Add someone' })).toBeNull();
  });

  it('a member on Home with a person has no create button', async () => {
    mockAccount = { profile: { accountType: 'member' } };
    await AsyncStorage.setItem(SESSIONS_KEY, JSON.stringify([anna]));
    render(<App />);
    await screen.findByLabelText('Anna');
    expect(screen.queryByText(ADD_PERSON)).toBeNull();
    expect(screen.queryByText(START_FIRST)).toBeNull();
  });

  it('an owner sees the start button on Home and Add someone in the switcher', async () => {
    mockAccount = { profile: { accountType: 'owner' } };
    render(<App />);
    expect(await screen.findByText(START_FIRST)).toBeTruthy();
    expect(screen.queryByText(MEMBER_EMPTY)).toBeNull();
  });

  it('an owner with a person sees Add someone in the switcher', async () => {
    mockAccount = { profile: { accountType: 'owner' } };
    await AsyncStorage.setItem(SESSIONS_KEY, JSON.stringify([anna]));
    await AsyncStorage.setItem(ACTIVE_KEY, 'a');
    render(<App />);
    fireEvent.press(await screen.findByRole('button', { name: 'Writing about Anna' }));
    expect(await screen.findByRole('button', { name: 'Add someone' })).toBeTruthy();
  });
});
