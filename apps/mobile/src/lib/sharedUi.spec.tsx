import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Button, Heading } from '@griever/ui';

/** libs/ui is written for React Native; this runs it on the native renderer. */
describe('shared UI on native', () => {
  it('renders a heading as a heading', () => {
    render(<Heading level={1}>One thing at a time.</Heading>);
    expect(screen.getByRole('heading', { name: 'One thing at a time.' })).toBeTruthy();
  });

  it('renders a button that calls onPress', () => {
    const onPress = jest.fn();
    render(<Button label="Start" onPress={onPress} />);
    fireEvent.press(screen.getByRole('button', { name: 'Start' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('says why an unavailable button is dimmed, and still calls onPress', () => {
    const onPress = jest.fn();
    render(<Button label="Share the service" onPress={onPress} ariaDisabled hint="Included with the full plan" />);
    const button = screen.getByRole('button', { name: 'Share the service' });
    expect(button.props.accessibilityState).toEqual({ disabled: true });
    expect(button.props.accessibilityHint).toBe('Included with the full plan');
    fireEvent.press(button);
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
