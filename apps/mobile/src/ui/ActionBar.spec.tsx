import { describe, expect, it, jest } from '@jest/globals';
import { StyleSheet, View } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { colors } from '@griever/tokens';
import { ActionBar } from './ActionBar';
import { Button } from './Button';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 47, bottom: 34, left: 0, right: 0 }),
}));

const flat = (node: { props: { style?: unknown } }) => StyleSheet.flatten(node.props.style as never) ?? {};

describe('ActionBar', () => {
  it('shows the label and calls onPress', () => {
    const onPress = jest.fn();
    render(<ActionBar label="Text 3 people" onPress={onPress} />);
    fireEvent.press(screen.getByRole('button', { name: 'Text 3 people' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('shows a muted line under the button', () => {
    render(<ActionBar label="Next" onPress={jest.fn()} note="Nothing is sent until you tap." />);
    expect(screen.getByText('Nothing is sent until you tap.')).toBeTruthy();
  });

  it('reads the hint after the label when available', () => {
    render(<ActionBar label="Sent to Ana? Next: Ben" hint="Marks Ana sent" onPress={jest.fn()} />);
    expect(screen.getByRole('button', { name: 'Sent to Ana? Next: Ben' }).props.accessibilityHint).toBe('Marks Ana sent');
  });

  it('uses the primary button, and the tappable button itself is at least 52 points tall', () => {
    render(<ActionBar label="Next" onPress={jest.fn()} />);
    expect(screen.UNSAFE_getByType(Button).props.variant ?? 'primary').toBe('primary');
    const pressable = screen.getByRole('button', { name: 'Next' });
    const style = StyleSheet.flatten(typeof pressable.props.style === 'function' ? pressable.props.style({ pressed: false }) : pressable.props.style);
    expect(style.minHeight).toBeGreaterThanOrEqual(52);
  });

  it('pads the bottom by the safe-area inset (34) or more, on the page colour with a top border', () => {
    render(<ActionBar label="Next" onPress={jest.fn()} />);
    const bar = screen.UNSAFE_getAllByType(View).find((v) => flat(v).paddingBottom !== undefined);
    const style = flat(bar as never);
    expect(style.paddingBottom).toBeGreaterThanOrEqual(34);
    expect(style.backgroundColor).toBe(colors.bg);
    expect(style.borderTopWidth).toBeGreaterThan(0);
  });

  it('with liveReason, the reason is a polite status line that is there before it has text', () => {
    const { rerender } = render(<ActionBar label="Text 1 person" onPress={jest.fn()} liveReason />);
    expect(screen.getAllByRole('status')).toHaveLength(1);
    expect(screen.getByRole('status').props.accessibilityLiveRegion).toBe('polite');
    rerender(<ActionBar label="Text 1 person" onPress={jest.fn()} liveReason disabledReason="Add a message first" />);
    expect(screen.getByRole('status').props.children).toBe('Add a message first');
  });

  it('without liveReason there is no live region', () => {
    render(<ActionBar label="Next" onPress={jest.fn()} note="Nothing is sent until you tap." />);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('shows the secondary slot above the button', () => {
    render(<ActionBar label="Next" onPress={jest.fn()} above={<Button variant="tertiary" label="Skip this one" onPress={jest.fn()} />} />);
    const order = screen.UNSAFE_getAllByType(Button).map((b) => b.props.label);
    expect(order).toEqual(['Skip this one', 'Next']);
  });

  it('when disabled stays focusable, shows the reason as a line and a hint, and does nothing on press', () => {
    const onPress = jest.fn();
    render(<ActionBar label="Text 0 people" onPress={onPress} note="Not shown" disabledReason="Pick at least one person" />);
    const button = screen.getByRole('button', { name: 'Text 0 people' });
    expect(screen.getByText('Pick at least one person')).toBeTruthy();
    expect(screen.queryByText('Not shown')).toBeNull();
    expect(button.props.accessibilityHint).toBe('Pick at least one person');
    expect(button.props.accessibilityState).toMatchObject({ disabled: true });
    expect(button.props.accessible).not.toBe(false);
    fireEvent.press(button);
    expect(onPress).not.toHaveBeenCalled();
  });

  it('treats an empty disabledReason as enabled, with no hint', () => {
    const onPress = jest.fn();
    render(<ActionBar label="Next" onPress={onPress} disabledReason="" />);
    const button = screen.getByRole('button', { name: 'Next' });
    expect(button.props.accessibilityHint).toBeUndefined();
    expect(button.props.accessibilityState?.disabled).toBeFalsy();
    fireEvent.press(button);
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
