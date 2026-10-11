import { describe, expect, it } from '@jest/globals';
import { render, screen } from '@testing-library/react-native';
import { App } from './App';

describe('App with the account feature off', () => {
  it('opens on the template picker with no account entry', async () => {
    render(<App />);
    expect(await screen.findByText('Grievers Guidance')).toBeTruthy();
    expect(screen.getByText('Choose the type of message you would like to send.')).toBeTruthy();
    expect(screen.queryByText('Your account')).toBeNull();
  });
});
