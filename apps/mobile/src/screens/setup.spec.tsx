import { describe, expect, it, jest } from '@jest/globals';
import { AccessibilityInfo, TextInput } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
// Jest has no native view tree, so findNodeHandle returns null; the focus test needs a handle.
// This path is specific to react-native 0.81 (Expo SDK 54). Re-check it when react-native is upgraded.
jest.mock('react-native/Libraries/ReactNative/RendererProxy', () => ({
  ...jest.requireActual<object>('react-native/Libraries/ReactNative/RendererProxy'),
  findNodeHandle: () => 1,
}));

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
    expect(screen.getByRole('heading', { name: 'Who are we writing about?' })).toBeTruthy();
    expect(screen.getByLabelText('Their name, required')).toBeTruthy();
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
    fireEvent.changeText(screen.getByLabelText('Their name, required'), '   ');
    expect(screen.getByRole('button', { name: 'Continue' }).props.accessibilityState.disabled).toBe(true);
  });

  it('continues with a name alone; the date is optional', () => {
    const { onContinue } = setup();
    fireEvent.changeText(screen.getByLabelText('Their name, required'), 'Anna Lee');
    fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    expect(onContinue).toHaveBeenCalledWith({ personName: 'Anna Lee', dateOfPassing: '' });
  });

  it('continues with both name and date', () => {
    const { onContinue } = setup();
    fireEvent.changeText(screen.getByLabelText('Their name, required'), ' Anna Lee ');
    fireEvent.changeText(screen.getByLabelText('Date of passing'), 'June 7, 2025');
    fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    expect(onContinue).toHaveBeenCalledWith({ personName: 'Anna Lee', dateOfPassing: 'June 7, 2025' });
  });

  it('starts from what is already kept, and Back leaves without saving', () => {
    const { onBack, onContinue } = setup({ personName: 'Anna', dateOfPassing: 'May 2, 2026' });
    expect(screen.getByLabelText('Their name, required').props.value).toBe('Anna');
    expect(screen.getByLabelText('Date of passing').props.value).toBe('May 2, 2026');
    fireEvent.press(screen.getByLabelText('Back to home'));
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(onContinue).not.toHaveBeenCalled();
  });
  it('moves screen-reader focus to the header on arrival', () => {
    const focus = jest.spyOn(AccessibilityInfo, 'setAccessibilityFocus');
    setup();
    expect(focus).toHaveBeenCalledWith(1);
  });

  it('has a name placeholder and a 16pt back link', () => {
    setup();
    expect(screen.getByPlaceholderText('e.g. Margaret Hayes')).toBeTruthy();
    expect(screen.getByText('← Back').props.style).toEqual(expect.objectContaining({ fontSize: 16 }));
  });

  it('explains the disabled Continue, and drops the hint once a name is typed', () => {
    setup();
    expect(screen.getByRole('button', { name: 'Continue' }).props.accessibilityHint).toBe('Type their name first');
    fireEvent.changeText(screen.getByLabelText('Their name, required'), 'Anna');
    expect(screen.getByRole('button', { name: 'Continue' }).props.accessibilityHint).toBeUndefined();
  });

  it('Return on the name moves to the date; Return on the date continues only with a name', () => {
    const { onContinue } = setup();
    const name = screen.getByLabelText('Their name, required');
    const date = screen.getByLabelText('Date of passing');
    expect(name.props.returnKeyType).toBe('next');
    expect(date.props.returnKeyType).toBe('done');
    const focus = jest.spyOn(TextInput.prototype, 'focus').mockImplementation(() => undefined);
    fireEvent(name, 'submitEditing');
    expect(focus).toHaveBeenCalled();
    fireEvent(date, 'submitEditing');
    expect(onContinue).not.toHaveBeenCalled();
    fireEvent.changeText(name, 'Anna');
    fireEvent(date, 'submitEditing');
    expect(onContinue).toHaveBeenCalledWith({ personName: 'Anna', dateOfPassing: '' });
  });
});
