import { describe, expect, it, jest } from '@jest/globals';
import { render, screen } from '@testing-library/react-native';
import { App } from './App';

// The installed react (19.2.x) does not match the renderer bundled in react-native 0.81.5 (19.1.0),
// and that renderer throws a version-mismatch error the first time the navigator animates a view.
// The renderer is not what this test is about, so stub the one entry point that loads it.
jest.mock('react-native/Libraries/Renderer/shims/ReactNative', () => ({
  __esModule: true,
  default: { findNodeHandle: () => null, dispatchCommand: () => undefined, sendAccessibilityEvent: () => undefined },
}));

describe('App with the account feature off', () => {
  it('opens on the template picker with no account entry', async () => {
    render(<App />);
    expect(await screen.findByText('Grievers Guidance')).toBeTruthy();
    expect(screen.getByText('Choose the type of message you would like to send.')).toBeTruthy();
    expect(screen.queryByText('Your account')).toBeNull();
  });
});
