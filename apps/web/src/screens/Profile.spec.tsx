import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Profile } from './Profile';

describe('Profile', () => {
  it('shows the saved name, including one that arrives after opening', () => {
    const { rerender } = render(
      <Profile senderName={null} onBack={vi.fn()} onSave={vi.fn()} onSignOut={vi.fn()} error={null} />,
    );
    expect(screen.getByLabelText('Your name')).toHaveValue('');
    rerender(<Profile senderName="Anna" onBack={vi.fn()} onSave={vi.fn()} onSignOut={vi.fn()} error={null} />);
    expect(screen.getByLabelText('Your name')).toHaveValue('Anna');
  });

  it('saves the edited name and says so calmly', async () => {
    const onSave = vi.fn(async () => true);
    const user = userEvent.setup();
    render(<Profile senderName="Anna" onBack={vi.fn()} onSave={onSave} onSignOut={vi.fn()} error={null} />);
    await user.clear(screen.getByLabelText('Your name'));
    await user.type(screen.getByLabelText('Your name'), 'Anna Reyes');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSave).toHaveBeenCalledWith('Anna Reyes');
    expect(await screen.findByText('Your name is saved.')).toBeInTheDocument();
  });

  it('keeps the typed name when saving fails', async () => {
    const user = userEvent.setup();
    render(
      <Profile
        senderName="Anna"
        onBack={vi.fn()}
        onSave={vi.fn(async () => false)}
        onSignOut={vi.fn()}
        error="You need a connection to do this. Nothing you've typed is lost."
      />,
    );
    await user.type(screen.getByLabelText('Your name'), ' Reyes');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByLabelText('Your name')).toHaveValue('Anna Reyes');
    expect(screen.queryByText('Your name is saved.')).not.toBeInTheDocument();
  });
});
