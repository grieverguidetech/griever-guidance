import { describe, expect, it, jest } from '@jest/globals';
import { StyleSheet } from 'react-native';
import { parseCompleteDate } from '@griever/shared';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { DetailsRow, isMissing } from './DetailsRow';

const copy = { detailsHeading: 'Details', detailsNeeded: 'Needed' };
const fields = [
  { key: 'a', label: 'Service name', placeholder: 'Name', required: true },
  { key: 'b', label: 'Notes', placeholder: 'Reception', required: false },
];
const dateFields = [
  { key: 'serviceDate', label: 'Service date', placeholder: 'June 14', required: true },
  { key: 'serviceTime', label: 'Time', placeholder: '2 pm', required: false },
];

describe('DetailsRow', () => {
  it('chains the keyboard: next on all but the last input, done on the last', () => {
    render(<DetailsRow copy={copy} fields={fields} values={{}} onChange={() => undefined} />);
    expect(screen.getByLabelText('Service name, Needed').props.returnKeyType).toBe('next');
    expect(screen.getByLabelText('Notes').props.returnKeyType).toBe('done');
  });

  it('names each input by its visible label, at least 44 high, and reports typing', () => {
    const onChange = jest.fn();
    render(<DetailsRow copy={copy} fields={fields} values={{ a: 'June 1' }} onChange={onChange} />);
    const input = screen.getByLabelText('Service name');
    expect(input.props.value).toBe('June 1');
    expect(StyleSheet.flatten(input.props.style).minHeight).toBeGreaterThanOrEqual(44);
    fireEvent.changeText(input, 'June 2');
    expect(onChange).toHaveBeenCalledWith('a', 'June 2');
    expect(screen.getByText('Notes', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.queryByText('Notes')).toBeNull();
  });

  it('marks only empty required fields', () => {
    render(<DetailsRow copy={copy} fields={fields} values={{}} onChange={() => undefined} />);
    expect(screen.getAllByText('Needed', { includeHiddenElements: true })).toHaveLength(1);
    expect(screen.getByLabelText('Service name, Needed')).toBeTruthy();
    expect(screen.getByLabelText('Notes')).toBeTruthy();
    expect(isMissing(fields[0], {})).toBe(true);
    expect(isMissing(fields[0], { a: '  ' })).toBe(true);
    expect(isMissing(fields[1], {})).toBe(false);
  });

  describe('service date', () => {
    const renderDate = (value = '') => {
      const onChange = jest.fn();
      render(<DetailsRow copy={copy} fields={dateFields} values={value ? { serviceDate: value } : {}} onChange={onChange} />);
      return onChange;
    };

    it('shows a date control, not a text box', () => {
      renderDate();
      expect(screen.getByRole('button', { name: 'Service date, Needed' })).toBeTruthy();
      expect(screen.queryByPlaceholderText('June 14')).toBeNull();
    });

    it('writes a picked day in the text web writes, and parseCompleteDate reads it back', () => {
      const onChange = renderDate();
      fireEvent.press(screen.getByRole('button', { name: 'Service date, Needed' }));
      fireEvent(screen.getByTestId('date-picker'), 'change', { type: 'set' }, new Date(2026, 10, 14));
      fireEvent.press(screen.getByRole('button', { name: 'Done' }));
      expect(onChange).toHaveBeenCalledWith('serviceDate', 'November 14, 2026');
      const written = onChange.mock.calls[0][1] as string;
      const read = parseCompleteDate(written);
      expect([read?.getFullYear(), read?.getMonth(), read?.getDate()]).toEqual([2026, 10, 14]);
    });

    it('allows a day far in the future', () => {
      renderDate();
      fireEvent.press(screen.getByRole('button', { name: 'Service date, Needed' }));
      const picker = screen.getByTestId('date-picker');
      expect((picker.props.maximumDate as Date).getFullYear()).toBeGreaterThanOrEqual(2100);
    });

    it('opens on a complete saved date written by web', () => {
      renderDate('June 7, 2025');
      fireEvent.press(screen.getByRole('button', { name: 'Service date' }));
      const value = screen.getByTestId('date-picker').props.value as Date;
      expect([value.getFullYear(), value.getMonth(), value.getDate()]).toEqual([2025, 5, 7]);
    });

    it('shows a partial saved text as typed, loses nothing until a day is picked, then replaces it', () => {
      const onChange = renderDate('Nov 8');
      expect(screen.getByText('Nov 8')).toBeTruthy();
      fireEvent.press(screen.getByRole('button', { name: 'Service date' }));
      expect(onChange).not.toHaveBeenCalled();
      const value = screen.getByTestId('date-picker').props.value as Date;
      const today = new Date();
      expect([value.getFullYear(), value.getMonth(), value.getDate()]).toEqual([today.getFullYear(), today.getMonth(), today.getDate()]);
      fireEvent(screen.getByTestId('date-picker'), 'change', { type: 'set' }, new Date(2026, 10, 8));
      fireEvent.press(screen.getByRole('button', { name: 'Done' }));
      expect(onChange).toHaveBeenCalledWith('serviceDate', 'November 8, 2026');
    });

    it('shows the dashed border while empty and required, and drops it once filled', () => {
      renderDate();
      expect(StyleSheet.flatten(screen.getByRole('button', { name: 'Service date, Needed' }).props.style).borderStyle).toBe('dashed');
      screen.unmount();
      renderDate('June 7, 2025');
      expect(StyleSheet.flatten(screen.getByRole('button', { name: 'Service date' }).props.style).borderStyle).toBeUndefined();
    });

    it('Clear empties it', () => {
      const onChange = renderDate('June 7, 2025');
      fireEvent.press(screen.getByRole('button', { name: 'Service date' }));
      fireEvent.press(screen.getByRole('button', { name: 'Clear the date' }));
      expect(onChange).toHaveBeenCalledWith('serviceDate', '');
    });

    it('keeps the Needed state only while empty, and the text at 15 pt or more', () => {
      renderDate();
      expect(screen.getAllByText('Needed', { includeHiddenElements: true })).toHaveLength(1);
      expect(StyleSheet.flatten(screen.getByText('Choose a date').props.style).fontSize).toBeGreaterThanOrEqual(15);
      expect(StyleSheet.flatten(screen.getByRole('button', { name: 'Service date, Needed' }).props.style).minHeight).toBeGreaterThanOrEqual(44);
    });
  });

  describe('service time', () => {
    const renderTime = (value = '') => {
      const onChange = jest.fn();
      render(<DetailsRow copy={copy} fields={dateFields} values={value ? { serviceTime: value } : {}} onChange={onChange} />);
      return onChange;
    };

    it('shows a time control, not a text box, with the template placeholder', () => {
      renderTime();
      expect(screen.getByRole('button', { name: 'Time' })).toBeTruthy();
      expect(screen.getByText('2 pm')).toBeTruthy();
    });

    it('writes a pick as "2:00 PM" through onChange', () => {
      const onChange = renderTime();
      fireEvent.press(screen.getByRole('button', { name: 'Time' }));
      fireEvent(screen.getByTestId('date-picker'), 'change', { type: 'set' }, new Date(2026, 10, 14, 14, 0));
      fireEvent.press(screen.getByRole('button', { name: 'Done' }));
      expect(onChange).toHaveBeenCalledWith('serviceTime', '2:00 PM');
    });

    it('shows a saved text the picker cannot read as typed, and replaces it on a pick', () => {
      const onChange = renderTime('around noon');
      expect(screen.getByText('around noon')).toBeTruthy();
      fireEvent.press(screen.getByRole('button', { name: 'Time' }));
      expect(onChange).not.toHaveBeenCalled();
      fireEvent.press(screen.getByRole('button', { name: 'Done' }));
      expect(onChange).toHaveBeenCalledTimes(1);
    });

    it('is never marked Needed when optional', () => {
      const onlyTime = [dateFields[1]];
      render(<DetailsRow copy={copy} fields={onlyTime} values={{}} onChange={() => undefined} />);
      expect(screen.queryByText('Needed', { includeHiddenElements: true })).toBeNull();
    });
  });
});
