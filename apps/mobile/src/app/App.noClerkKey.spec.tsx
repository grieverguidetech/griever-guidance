import { describe, expect, it } from '@jest/globals';
import { render, screen } from '@testing-library/react-native';

// A production build with the account flag on but the Clerk key missing from the EAS environment.
process.env.EXPO_PUBLIC_FEATURE_AUTH = 'true';
process.env.EXPO_PUBLIC_FEATURE_SYNC = 'true';
delete process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;

import { App } from './App';

describe('App with the account flag on but no Clerk key', () => {
  it('does not crash: opens on Home on this phone only, with no account entry', async () => {
    render(<App />);
    expect(await screen.findByText("Who you're writing about")).toBeTruthy();
    expect(screen.getByText("Start with someone I've lost")).toBeTruthy();
    expect(screen.queryByText('Your account')).toBeNull();
  });
});
