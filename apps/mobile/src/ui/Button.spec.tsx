import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { ActivityIndicator } from 'react-native';
import { Button } from './Button';

describe('Button (mobile)', () => {
  it('while busy shows the busy words and a spinner, and reads as busy and unavailable', () => {
    render(<Button label="Save" busyLabel="Saving…" onPress={jest.fn()} busy />);
    expect(screen.getByText('Saving…')).toBeTruthy();
    expect(screen.queryByText('Save')).toBeNull();
    expect(screen.UNSAFE_getAllByType(ActivityIndicator)).toHaveLength(1);
    const button = screen.getByRole('button', { name: 'Saving…' });
    expect(button.props.accessibilityState).toMatchObject({ busy: true, disabled: true });
  });

  it('without busy it has no spinner and no busy state', () => {
    render(<Button label="Save" busyLabel="Saving…" onPress={jest.fn()} />);
    expect(screen.UNSAFE_queryAllByType(ActivityIndicator)).toHaveLength(0);
    expect(screen.getByRole('button', { name: 'Save' }).props.accessibilityState?.busy).toBeFalsy();
  });

  it('calls onPress when pressed', () => {
    const onPress = jest.fn();
    render(<Button label="Save" onPress={onPress} />);
    fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
