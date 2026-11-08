import { describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { AccessibilityInfo, Pressable, TextInput } from 'react-native';
import { screenCopy } from '@griever/copy';
import { Account } from './Account';
import type { AccountCopy, AccountProps, DetailValues } from './Account';

// Jest has no native view tree, so findNodeHandle returns null; the focus test needs a handle. Same replacement as screens/account.spec.tsx.
jest.mock('react-native/Libraries/ReactNative/RendererProxy', () => ({
  ...jest.requireActual<object>('react-native/Libraries/ReactNative/RendererProxy'),
  findNodeHandle: () => 1,
}));

const copy: AccountCopy = {
  ...screenCopy('account'),
  ...screenCopy('phoneAccount'),
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
    onSupport: jest.fn(),
    onBack: jest.fn(),
    ...over,
  };
  render(<Account {...props} />);
  return props;
}

const save = () => fireEvent.press(screen.getByRole('button', { name: 'Save' }));

describe('Account (mobile save guard)', () => {
  it('calls save from the primary button', () => {
    const props = setup();
    save();
    expect(props.onPrimary).toHaveBeenCalledTimes(1);
  });

  it('ignores a second press while the first save is still running, even before primaryBusy shows', async () => {
    let finish: () => void = () => undefined;
    const onPrimary = jest.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
    setup({ onPrimary });
    save();
    save();
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
      .getAllByText(/./, { includeHiddenElements: true })
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

  it('ties each message to its field as the accessibility hint, and keeps the visible text', () => {
    setup({ errors: { firstName: 'Please enter your first name.', city: 'Please enter the city.' } });
    expect(screen.getByLabelText('First name, required').props.accessibilityHint).toBe('Please enter your first name.');
    expect(screen.getByLabelText('City').props.accessibilityHint).toBe('Please enter the city.');
    expect(screen.getByLabelText('State').props.accessibilityHint).toBeUndefined();
    expect(screen.getByText('Please enter your first name.')).toBeTruthy();
  });

  it('chains the Next key through the fields in order, and ZIP says done', () => {
    setup();
    const order = ['First name, required', 'Last name (optional)', 'Address line 1', 'Address line 2 (optional)', 'City', 'State', 'ZIP code'];
    const focus = new Map<string, jest.Mock>();
    for (const input of screen.UNSAFE_getAllByType(TextInput)) {
      const fn = jest.fn();
      (input.instance as unknown as { focus: () => void }).focus = fn;
      focus.set(String(input.props.accessibilityLabel), fn);
    }
    for (let i = 0; i < order.length - 1; i += 1) {
      fireEvent(screen.getByLabelText(order[i]), 'submitEditing');
      expect(focus.get(order[i + 1])).toHaveBeenCalledTimes(1);
    }
    fireEvent(screen.getByLabelText('ZIP code'), 'submitEditing');
    for (const name of order) {
      expect(screen.getByLabelText(name).props.returnKeyType).toBe(name === 'ZIP code' ? 'done' : 'next');
    }
  });

  it('hides the visible date label from screen readers, so the name is read once', () => {
    setup();
    const label = screen.getByText('Date of birth', { includeHiddenElements: true });
    expect(label.props['aria-hidden']).toBe(true);
    expect(screen.queryByText('Date of birth')).toBeNull();
    expect(screen.getByRole('button', { name: 'Date of birth, optional' })).toBeTruthy();
  });

  it('moves screen-reader and keyboard focus to the requested field', () => {
    const spy = jest.spyOn(AccessibilityInfo, 'setAccessibilityFocus').mockImplementation(() => undefined);
    const props = setup();
    const target = screen.UNSAFE_getAllByType(TextInput).find((i) => i.props.accessibilityLabel === 'City');
    const focus = jest.fn();
    (target?.instance as unknown as { focus: () => void }).focus = focus;
    screen.rerender(<Account {...props} focusRequest={{ field: 'city', id: 1 }} />);
    expect(focus).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('shows Try again only when asked, and calls it', () => {
    const onRetry = jest.fn();
    setup({ onRetry });
    fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('shows no Try again by default', () => {
    setup();
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
  });
});

describe('Account sign-in, sign out and support (#718)', () => {
  const headings = () => screen.getAllByRole('heading').map((node) => node.props.children);

  it('shows the email read-only: text, not a field', () => {
    setup();
    const without = screen.UNSAFE_getAllByType(TextInput).length;
    screen.unmount();
    setup({ email: 'sam@example.com' });
    expect(screen.getByText('Email')).toBeTruthy();
    expect(screen.getByText('sam@example.com')).toBeTruthy();
    expect(screen.UNSAFE_getAllByType(TextInput)).toHaveLength(without);
    expect(screen.getByLabelText('Email, sam@example.com')).toBeTruthy();
    expect(screen.queryByLabelText('sam@example.com')).toBeNull();
  });

  it('gives every group a header role, in order: Profile, Sign-in and security, Sign out, Help and support', () => {
    setup({ email: 'sam@example.com', onManageSignIn: jest.fn() });
    expect(headings()).toEqual(['Your account', 'Profile', 'Address', 'Sign-in and security', 'Sign out', 'Help and support']);
  });

  it('hides the sign-in group until there is an email or a manage address', () => {
    setup();
    expect(headings()).toEqual(['Your account', 'Profile', 'Address', 'Sign out', 'Help and support']);
    expect(screen.queryByRole('button', { name: 'Manage sign-in' })).toBeNull();
  });

  it('shows Manage sign-in only when it can be opened, and calls it', () => {
    const onManageSignIn = jest.fn();
    setup({ email: 'sam@example.com', onManageSignIn });
    fireEvent.press(screen.getByRole('button', { name: 'Manage sign-in' }));
    expect(onManageSignIn).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Change your email, password or the devices signed in to your account.')).toBeTruthy();
  });

  it('shows the sign out heading and hint with the button', () => {
    setup();
    expect(screen.getByText('Your work stays on this device. You can sign in again when you are ready.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeTruthy();
  });

  it('shows the support text, the address as text and a button, and no failure line at first', () => {
    const props = setup();
    expect(screen.getByText('Write to us if you have a question or something is not working.')).toBeTruthy();
    expect(screen.getByText('grieversguidancetech@gmail.com')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Email support' }));
    expect(props.onSupport).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/could not open your email app/)).toBeNull();
  });

  it('says the address can be copied when the email app did not open', () => {
    setup({ supportFailed: true });
    expect(screen.getByText(/could not open your email app. You can copy the address above/)).toBeTruthy();
  });
});
