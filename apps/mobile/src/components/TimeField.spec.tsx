import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { AccessibilityInfo, Platform, StyleSheet } from 'react-native';
import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { TimeField } from './TimeField';

// The test renderer has no native handles, so give every field one.
jest.mock('react-native/Libraries/ReactNative/RendererProxy', () => ({
  ...jest.requireActual<object>('react-native/Libraries/ReactNative/RendererProxy'),
  findNodeHandle: () => 42,
}));

const copy = { placeholder: 'Choose a time', done: 'Done', clear: 'Clear it', hint: 'Opens a clock' };

const setup = (value = '', missing = false) => {
  const onChange = jest.fn();
  render(<TimeField copy={copy} value={value} onChange={onChange} accessibleName="Time" missing={missing} />);
  return { onChange };
};
const field = () => screen.getByRole('button', { name: 'Time' });

describe('TimeField', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('iOS: picking only moves the draft; the text is written once, on Done', () => {
    const { onChange } = setup();
    fireEvent.press(field());
    const picker = screen.getByTestId('date-picker');
    expect(picker.props.mode).toBe('time');
    fireEvent(picker, 'change', { type: 'set' }, new Date(2026, 0, 1, 13, 0));
    fireEvent(picker, 'change', { type: 'set' }, new Date(2026, 0, 1, 14, 0));
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.press(screen.getByRole('button', { name: 'Done' }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('2:00 PM');
  });

  it('opens on a saved time written by web', () => {
    setup('11:30 AM');
    fireEvent.press(field());
    const value = screen.getByTestId('date-picker').props.value as Date;
    expect([value.getHours(), value.getMinutes()]).toEqual([11, 30]);
  });

  it('shows text the picker cannot read as typed, keeps it until Done, then replaces it', () => {
    const { onChange } = setup('around noon');
    expect(screen.getByText('around noon')).toBeTruthy();
    fireEvent.press(field());
    expect(onChange).not.toHaveBeenCalled();
    fireEvent(screen.getByTestId('date-picker'), 'change', { type: 'set' }, new Date(2026, 0, 1, 12, 0));
    fireEvent.press(screen.getByRole('button', { name: 'Done' }));
    expect(onChange).toHaveBeenCalledWith('12:00 PM');
  });

  it('Android: Set writes the time at once, in a 12-hour dialog', () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    const { onChange } = setup();
    fireEvent.press(field());
    const options = jest.mocked(DateTimePickerAndroid.open).mock.calls.at(-1)?.[0];
    expect(options?.mode).toBe('time');
    expect(options?.is24Hour).toBe(false);
    options?.onChange?.({ type: 'set' } as never, new Date(2026, 0, 1, 9, 7));
    expect(onChange).toHaveBeenCalledWith('9:07 AM');
  });

  it('Android: dismissing writes nothing, and the Clear button empties the value', () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    const { onChange } = setup('2:00 PM');
    fireEvent.press(field());
    const options = jest.mocked(DateTimePickerAndroid.open).mock.calls.at(-1)?.[0];
    options?.onChange?.({ type: 'dismissed' } as never, undefined);
    expect(onChange).not.toHaveBeenCalled();
    options?.onChange?.({ type: 'neutralButtonPressed' } as never, undefined);
    expect(onChange).toHaveBeenCalledWith('');
  });

  it('Clear empties the value', () => {
    const { onChange } = setup('2:00 PM');
    fireEvent.press(field());
    fireEvent.press(screen.getByRole('button', { name: 'Clear it' }));
    expect(onChange).toHaveBeenCalledWith('');
  });

  it('puts screen-reader focus back on the field after Done and after Clear', () => {
    const focus = jest.spyOn(AccessibilityInfo, 'setAccessibilityFocus').mockImplementation(() => undefined);
    setup('2:00 PM');
    fireEvent.press(field());
    fireEvent.press(screen.getByRole('button', { name: 'Done' }));
    expect(focus).toHaveBeenCalledWith(42);
    focus.mockClear();
    fireEvent.press(field());
    fireEvent.press(screen.getByRole('button', { name: 'Clear it' }));
    expect(focus).toHaveBeenCalledWith(42);
  });

  it('draws the dashed border only when missing', () => {
    setup('', true);
    expect(StyleSheet.flatten(field().props.style).borderStyle).toBe('dashed');
    screen.unmount();
    setup();
    expect(StyleSheet.flatten(field().props.style).borderStyle).toBeUndefined();
  });

  it('keeps the text at 15 pt or more and the target at 44 or more', () => {
    setup();
    expect(StyleSheet.flatten(screen.getByText('Choose a time').props.style).fontSize).toBeGreaterThanOrEqual(15);
    expect(StyleSheet.flatten(field().props.style).minHeight).toBeGreaterThanOrEqual(44);
  });
});
