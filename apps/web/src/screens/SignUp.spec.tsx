import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SignUp } from './SignUp';

function setup(onSubmit = vi.fn(async () => false), error: string | null = null) {
  const user = userEvent.setup();
  render(<SignUp onSubmit={onSubmit} onSignIn={vi.fn()} error={error} />);
  return { user, onSubmit };
}

describe('SignUp', () => {
  it('labels every field and sets the keyboard hints for a phone', () => {
    setup();
    expect(screen.getByLabelText('Your name')).toHaveAttribute('autocomplete', 'name');
    const email = screen.getByLabelText('Email');
    expect(email).toHaveAttribute('type', 'email');
    expect(email).toHaveAttribute('inputmode', 'email');
    expect(email).toHaveAttribute('autocomplete', 'email');
    expect(screen.getByLabelText('Password')).toHaveAttribute('autocomplete', 'new-password');
  });

  it('shows the error in a polite live region', () => {
    setup(undefined, 'Please choose a stronger password.');
    expect(screen.getByText('Please choose a stronger password.')).toHaveAttribute('aria-live', 'polite');
  });

  it('disables the button and shows a pending label while it waits, then keeps the fields', async () => {
    let finish: (ok: boolean) => void = () => undefined;
    const onSubmit = vi.fn(() => new Promise<boolean>((resolve) => (finish = resolve)));
    const { user } = setup(onSubmit);
    await user.type(screen.getByLabelText('Your name'), 'Anna');
    await user.type(screen.getByLabelText('Email'), 'a@b.co');
    await user.type(screen.getByLabelText('Password'), 'secret-pass');
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    expect(screen.getByRole('button', { name: 'Creating your account…' })).toBeDisabled();
    finish(false);
    expect(await screen.findByRole('button', { name: 'Create account' })).toBeEnabled();
    expect(onSubmit).toHaveBeenCalledWith({ name: 'Anna', email: 'a@b.co', password: 'secret-pass' });
    expect(screen.getByLabelText('Password')).toHaveValue('secret-pass');
  });

  it('asks to check email when the account was made but no session started', async () => {
    const { user } = setup(vi.fn(async () => true));
    await user.type(screen.getByLabelText('Your name'), 'Anna');
    await user.type(screen.getByLabelText('Email'), 'a@b.co');
    await user.type(screen.getByLabelText('Password'), 'secret-pass');
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByText('Please check your email to finish setting up your account.')).toBeInTheDocument();
  });
});
