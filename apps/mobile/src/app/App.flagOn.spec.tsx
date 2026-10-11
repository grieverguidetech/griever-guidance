import { describe, expect, it } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';

// Each spec file has its own module registry, so setting the flag before App is first required is
// enough. (jest.isolateModules loads a second copy of react and breaks hooks here.)
process.env.EXPO_PUBLIC_FEATURE_AUTH = 'true';
const { App } = require('./App') as typeof import('./App');

describe('App with the account feature on', () => {
  it('shows the account link and opens the account screen', async () => {
    render(<App />);
    fireEvent.press(await screen.findByText('Your account'));
    // No Supabase settings in tests, so accounts are unavailable and the screen says so calmly.
    expect(await screen.findByText("Accounts aren't available right now.")).toBeTruthy();
    expect(screen.getByRole('header', { name: 'Your account' })).toBeTruthy();
  });
});
