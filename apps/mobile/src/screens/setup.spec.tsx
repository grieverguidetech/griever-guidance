import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { SetupScreen } from './SetupScreen';

const setup = (initial = { personName: '', dateOfPassing: '' }) => {
  const onContinue = jest.fn();
  const onBack = jest.fn();
  render(<SetupScreen initial={initial} onContinue={onContinue} onBack={onBack} />);
  return { onContinue, onBack };
};

describe('SetupScreen', () => {
  it('has a header, labelled inputs and no obituary field (C10)', () => {
    setup();
    expect(screen.getByRole('header', { name: 'Who are we writing about?' })).toBeTruthy();
    expect(screen.getByLabelText('Their name')).toBeTruthy();
    expect(screen.getByLabelText('Date of passing')).toBeTruthy();
    expect(screen.queryByLabelText(/obituary/i)).toBeNull();
    expect(screen.queryByText(/obituary/i)).toBeNull();
  });

  it('keeps Continue disabled until a name is typed', () => {
    const { onContinue } = setup();
    const button = screen.getByRole('button', { name: 'Continue' });
    expect(button.props.accessibilityState.disabled).toBe(true);
    fireEvent.press(button);
    expect(onContinue).not.toHaveBeenCalled();
    fireEvent.changeText(screen.getByLabelText('Their name'), '   ');
    expect(screen.getByRole('button', { name: 'Continue' }).props.accessibilityState.disabled).toBe(true);
  });

  it('continues with a name alone; the date is optional', () => {
    const { onContinue } = setup();
    fireEvent.changeText(screen.getByLabelText('Their name'), 'Anna Lee');
    fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    expect(onContinue).toHaveBeenCalledWith({ personName: 'Anna Lee', dateOfPassing: '' });
  });

  it('continues with both name and date', () => {
    const { onContinue } = setup();
    fireEvent.changeText(screen.getByLabelText('Their name'), ' Anna Lee ');
    fireEvent.changeText(screen.getByLabelText('Date of passing'), 'June 7, 2025');
    fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    expect(onContinue).toHaveBeenCalledWith({ personName: 'Anna Lee', dateOfPassing: 'June 7, 2025' });
  });

  it('starts from what is already kept, and Back leaves without saving', () => {
    const { onBack, onContinue } = setup({ personName: 'Anna', dateOfPassing: 'May 2, 2026' });
    expect(screen.getByLabelText('Their name').props.value).toBe('Anna');
    expect(screen.getByLabelText('Date of passing').props.value).toBe('May 2, 2026');
    fireEvent.press(screen.getByLabelText('Back to home'));
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(onContinue).not.toHaveBeenCalled();
  });
});
