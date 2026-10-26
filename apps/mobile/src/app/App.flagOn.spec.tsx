import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Each spec file has its own module registry, so setting the flag before App is first required is
// enough. (jest.isolateModules loads a second copy of react and breaks hooks here.)
process.env.EXPO_PUBLIC_FEATURE_AUTH = 'true';
const mockClerkProvider = jest.fn();
jest.mock('@clerk/expo', () => ({
  ...jest.requireActual<object>('@clerk/expo'),
  ClerkProvider: (props: { children: unknown }) => {
    mockClerkProvider();
    return props.children;
  },
}));
const { App } = require('./App') as typeof import('./App');

describe('App with the account feature on', () => {
  it('has no What you\'ll need link on Home; the list lives on Your account', async () => {
    render(<App />);
    await screen.findByText('Your account');
    expect(screen.queryByText("What you'll need")).toBeNull();
  });

  it('shows the account link and opens the account screen', async () => {
    render(<App />);
    fireEvent.press(await screen.findByText('Your account'));
    // No Clerk key in tests, so accounts are unavailable and the screen says so calmly.
    expect(await screen.findByText("Accounts aren't available right now.")).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Your account' })).toBeTruthy();
    expect(mockClerkProvider).not.toHaveBeenCalled();
  });

  it('still reaches Your account from Home after the hub (the old picker link is gone)', async () => {
    const anna = {
      id: 'a', flowId: 'flow-a', ownerId: null, role: 'owner', personName: 'Anna', dateOfPassing: '', senderName: '', obituaryUrl: '',
      createdAt: '2026-10-01T00:00:00.000Z', lastOpenedAt: '2026-10-01T00:00:00.000Z', drafts: {}, serviceReady: false,
      recipientsNotified: {}, momentCompletedAt: {}, remindersScheduled: [],
    };
    await AsyncStorage.setItem('gg.sessions.v1', JSON.stringify([anna]));
    render(<App />);
    fireEvent.press(await screen.findByLabelText('Anna'));
    await screen.findByText('One thing at a time.');
    fireEvent.press(screen.getByRole('button', { name: 'Back' }));
    expect(await screen.findByText('Your account')).toBeTruthy();
  });
});
