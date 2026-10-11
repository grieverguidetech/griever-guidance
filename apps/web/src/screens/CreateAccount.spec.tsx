import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CreateAccount } from './CreateAccount';

describe('CreateAccount (sign in)', () => {
  it('has labelled email and password fields with the right autocomplete', () => {
    render(<CreateAccount onBack={vi.fn()} onSubmit={vi.fn(async () => false)} error={null} />);
    expect(screen.getByLabelText('Email')).toHaveAttribute('inputmode', 'email');
    expect(screen.getByLabelText('Email')).toHaveAttribute('autocomplete', 'email');
    expect(screen.getByLabelText('Password')).toHaveAttribute('autocomplete', 'current-password');
  });

  it('submits trimmed email and keeps the fields when it fails', async () => {
    const onSubmit = vi.fn(async () => false);
    const user = userEvent.setup();
    render(<CreateAccount onBack={vi.fn()} onSubmit={onSubmit} error="Too many tries. Please wait a few minutes and try again." />);
    await user.type(screen.getByLabelText('Email'), ' a@b.co ');
    await user.type(screen.getByLabelText('Password'), 'secret-pass');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(onSubmit).toHaveBeenCalledWith({ email: 'a@b.co', password: 'secret-pass' });
    expect(screen.getByLabelText('Password')).toHaveValue('secret-pass');
    expect(screen.getByText(/Too many tries/)).toHaveAttribute('aria-live', 'polite');
  });
});
