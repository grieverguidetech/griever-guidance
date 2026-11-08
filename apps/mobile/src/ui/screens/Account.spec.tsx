import { describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Pressable, TextInput } from 'react-native';
import { screenCopy } from '@griever/copy';
import { Account } from './Account';
import type { AccountCopy, AccountProps, DetailValues } from './Account';

const copy: AccountCopy = {
  ...screenCopy('account'),
  requiredWord: 'required',
  optionalWord: 'optional',
};

const values: DetailValues = { firstName: 'Anna', lastName: '', line1: '', line2: '', city: '', state: '', zip: '' };

function setup(over: Partial<AccountProps> = {}) {
  const props: AccountProps = {
    copy,
    values,
    onChange: jest.fn(),
    renderBirthDate: ({ accessibleName }) => <Pressable accessibilityRole="button" accessibilityLabel={accessibleName} />,
    primaryLabel: 'Save',
    onPrimary: jest.fn<() => void | Promise<void>>(),
    onSignOut: jest.fn(),
    onBack: jest.fn(),
    ...over,
  };
  render(<Account {...props} />);
  return props;
}

const save = () => fireEvent.press(screen.getByRole('button', { name: 'Save' }));
const enter = () => fireEvent(screen.getByLabelText('ZIP code'), 'submitEditing');

describe('Account (mobile save guard)', () => {
  it('calls save from the primary button and from the keyboard Go key', () => {
    const props = setup();
    save();
    enter();
    expect(props.onPrimary).toHaveBeenCalledTimes(2);
  });

  it('ignores a second press while the first save is still running, even before primaryBusy shows', async () => {
    let finish: () => void = () => undefined;
    const onPrimary = jest.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
    setup({ onPrimary });
    save();
    save();
    enter();
    expect(onPrimary).toHaveBeenCalledTimes(1);
    await act(async () => {
      finish();
    });
    save();
    expect(onPrimary).toHaveBeenCalledTimes(2);
  });

  it('lets go of the guard when onPrimary throws, so the next press runs', () => {
    const onPrimary = jest.fn(() => {
      throw new Error('boom');
    });
    setup({ onPrimary });
    expect(save).toThrow('boom');
    expect(save).toThrow('boom');
    expect(onPrimary).toHaveBeenCalledTimes(2);
  });

  it('does not save while primaryBusy shows', () => {
    const props = setup({ primaryBusy: true });
    save();
    expect(props.onPrimary).not.toHaveBeenCalled();
  });

  it('has Back in the top bar and no other header button', () => {
    setup();
    expect(screen.getByRole('button', { name: 'Back' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: "What you'll need" })).toBeNull();
  });
});

describe('Account personal details (#717)', () => {
  it('shows every field with its account.json label, in order', () => {
    setup();
    const labels = [
      'First name',
      'Last name (optional)',
      'Date of birth',
      'Address',
      'Address line 1',
      'Address line 2 (optional)',
      'City',
      'State',
      'ZIP code',
    ];
    const text = screen
      .getAllByText(/./)
      .map((node) => node.props.children)
      .filter((child): child is string => typeof child === 'string');
    const positions = labels.map((label) => text.indexOf(label));
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    expect(screen.getByText('Optional. Only you can see this.')).toBeTruthy();
  });

  it('reads required and optional in the accessible names', () => {
    setup();
    expect(screen.getByLabelText('First name, required')).toBeTruthy();
    expect(screen.getByLabelText('Last name (optional)')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Date of birth, optional' })).toBeTruthy();
    expect(screen.getByLabelText('Address line 2 (optional)')).toBeTruthy();
  });

  it('gives every text field a label, so none is unnamed', () => {
    setup();
    const inputs = screen.UNSAFE_getAllByType(TextInput);
    expect(inputs).toHaveLength(7);
    for (const input of inputs) {
      expect(String(input.props.accessibilityLabel ?? '')).not.toBe('');
    }
  });

  it('shows the values and reports typing by field', () => {
    const props = setup({ values: { ...values, city: 'Newark' } });
    expect(screen.getByLabelText('City').props.value).toBe('Newark');
    fireEvent.changeText(screen.getByLabelText('State'), 'NJ');
    expect(props.onChange).toHaveBeenCalledWith('state', 'NJ');
  });

  it('shows a message under each field that is wrong', () => {
    setup({ errors: { firstName: 'Please enter your first name.', birthDate: 'Please check the date.', zip: 'Please enter the ZIP code.' } });
    expect(screen.getByText('Please enter your first name.')).toBeTruthy();
    expect(screen.getByText('Please check the date.')).toBeTruthy();
    expect(screen.getByText('Please enter the ZIP code.')).toBeTruthy();
  });

  it('makes every field read-only when the session has ended', () => {
    setup({ fieldDisabled: true });
    for (const input of screen.UNSAFE_getAllByType(TextInput)) {
      expect(input.props.editable).toBe(false);
    }
  });
});
