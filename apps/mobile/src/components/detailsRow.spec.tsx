import { describe, expect, it, jest } from '@jest/globals';
import { StyleSheet } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { DetailsRow, isMissing } from './DetailsRow';

const copy = { detailsHeading: 'Details', detailsNeeded: 'Needed' };
const fields = [
  { key: 'a', label: 'Service date', placeholder: 'June 14', required: true },
  { key: 'b', label: 'Notes', placeholder: 'Reception', required: false },
];

describe('DetailsRow', () => {
  it('chains the keyboard: next on all but the last input, done on the last', () => {
    render(<DetailsRow copy={copy} fields={fields} values={{}} onChange={() => undefined} />);
    expect(screen.getByLabelText('Service date, Needed').props.returnKeyType).toBe('next');
    expect(screen.getByLabelText('Notes').props.returnKeyType).toBe('done');
  });

  it('names each input by its visible label, at least 44 high, and reports typing', () => {
    const onChange = jest.fn();
    render(<DetailsRow copy={copy} fields={fields} values={{ a: 'June 1' }} onChange={onChange} />);
    const input = screen.getByLabelText('Service date');
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
    expect(screen.getByLabelText('Service date, Needed')).toBeTruthy();
    expect(screen.getByLabelText('Notes')).toBeTruthy();
    expect(isMissing(fields[0], {})).toBe(true);
    expect(isMissing(fields[0], { a: '  ' })).toBe(true);
    expect(isMissing(fields[1], {})).toBe(false);
  });
});
