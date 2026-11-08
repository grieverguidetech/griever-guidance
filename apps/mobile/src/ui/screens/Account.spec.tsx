import { describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Account } from './Account';
import type { AccountCopy, AccountProps } from './Account';

const copy: AccountCopy = {
  heading: 'Your account',
  back: 'Back',
  nameLabel: 'Your name',
  signOut: 'Sign out',
  offline: 'You are offline. You can change your name when you are connected.',
};

function setup(over: Partial<AccountProps> = {}) {
  const props: AccountProps = {
    copy,
    name: 'Anna',
    onNameChange: jest.fn(),
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
const enter = () => fireEvent(screen.getByLabelText('Your name'), 'submitEditing');

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

  it("renders no What you'll need button", () => {
    setup();
    expect(screen.queryByRole('button', { name: "What you'll need" })).toBeNull();
    expect(screen.getByRole('button', { name: 'Back' })).toBeTruthy();
  });
});
