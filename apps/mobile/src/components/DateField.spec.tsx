import { describe, expect, it, jest } from '@jest/globals';
import { Platform, StyleSheet } from 'react-native';
import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { DateField } from './DateField';

const copy = { datePlaceholder: 'Choose a date', dateDone: 'Done', dateClear: 'Clear it', dateHint: 'Opens a calendar' };
const maximumDate = new Date(2026, 5, 1);
const minimumDate = new Date(1900, 0, 1);

const setup = (value = '') => {
  const onChange = jest.fn();
  render(<DateField copy={copy} value={value} onChange={onChange} accessibleName="Date of birth (optional)" maximumDate={maximumDate} minimumDate={minimumDate} />);
  return { onChange };
};
const field = () => screen.getByRole('button', { name: 'Date of birth (optional)' });

describe('DateField', () => {
  it('passes the latest and earliest day to the iOS picker', () => {
    setup();
    fireEvent.press(field());
    const picker = screen.getByTestId('date-picker');
    expect(picker.props.maximumDate).toBe(maximumDate);
    expect(picker.props.minimumDate).toBe(minimumDate);
  });

  it('passes the latest and earliest day to the Android dialog', () => {
    const platform = jest.replaceProperty(Platform, 'OS', 'android');
    setup();
    fireEvent.press(field());
    const options = jest.mocked(DateTimePickerAndroid.open).mock.calls.at(-1)?.[0];
    expect(options?.maximumDate).toBe(maximumDate);
    expect(options?.minimumDate).toBe(minimumDate);
    platform.restore();
  });

  it('writes a picked day as "Month d, yyyy"', () => {
    const { onChange } = setup();
    fireEvent.press(field());
    fireEvent(screen.getByTestId('date-picker'), 'change', { type: 'set' }, new Date(1948, 2, 9));
    expect(onChange).toHaveBeenCalledWith('March 9, 1948');
  });

  it('Clear empties the value', () => {
    const { onChange } = setup('March 9, 1948');
    fireEvent.press(field());
    fireEvent.press(screen.getByRole('button', { name: 'Clear it' }));
    expect(onChange).toHaveBeenCalledWith('');
  });

  it('opens on a saved day that is before 2000 when the minimum allows it', () => {
    setup('March 9, 1948');
    fireEvent.press(field());
    const value = screen.getByTestId('date-picker').props.value as Date;
    expect([value.getFullYear(), value.getMonth(), value.getDate()]).toEqual([1948, 2, 9]);
  });

  it('shows the placeholder when empty and the text at 15 pt or more', () => {
    setup();
    expect(StyleSheet.flatten(screen.getByText('Choose a date').props.style).fontSize).toBeGreaterThanOrEqual(15);
  });
});
