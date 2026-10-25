// PROTOTYPE #322
import { fireEvent, render, screen } from '@testing-library/react-native';
import { PrototypeHubScreen } from './PrototypeHubScreen';

describe('PROTOTYPE shared hub on native', () => {
  it('shows the heading as a header and the buttons by role and name', () => {
    render(<PrototypeHubScreen />);
    expect(screen.getByRole('heading', { name: 'One thing at a time.' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Back' })).toBeTruthy();
    expect(screen.getByRole('button', { name: "What you'll need" })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Start' })).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Edit person' }));
  });
});
