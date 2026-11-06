import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { ActivityIndicator, StyleSheet } from 'react-native';
import { minTouchTarget } from '@griever/tokens';
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

  it('reads open or closed when expanded is given, and says nothing otherwise', () => {
    const { rerender } = render(<Button label="Edit" onPress={jest.fn()} expanded={false} />);
    expect(screen.getByRole('button', { name: 'Edit' }).props.accessibilityState).toMatchObject({ expanded: false });
    rerender(<Button label="Edit" onPress={jest.fn()} expanded />);
    expect(screen.getByRole('button', { name: 'Edit' }).props.accessibilityState).toMatchObject({ expanded: true });
    rerender(<Button label="Edit" onPress={jest.fn()} />);
    expect(screen.getByRole('button', { name: 'Edit' }).props.accessibilityState?.expanded).toBeUndefined();
  });

  it('calls onPress when pressed', () => {
    const onPress = jest.fn();
    render(<Button label="Save" onPress={onPress} />);
    fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('keeps its own minimum height unless minHeight is given', () => {
    const heightOf = (node: { props: { style?: unknown } }) =>
      StyleSheet.flatten(typeof node.props.style === 'function' ? node.props.style({ pressed: false }) : node.props.style).minHeight;
    const { rerender } = render(<Button label="Save" onPress={jest.fn()} />);
    expect(heightOf(screen.getByRole('button', { name: 'Save' }))).toBe(minTouchTarget);
    rerender(<Button label="Save" onPress={jest.fn()} minHeight={52} />);
    expect(heightOf(screen.getByRole('button', { name: 'Save' }))).toBe(52);
  });
});
