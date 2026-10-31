import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AccountSection, AccountSettingsSection } from './AccountSection';

function profile(overrides: Partial<Parameters<typeof AccountSection>[0]> = {}) {
  const props = {
    senderName: 'Anna' as string | null,
    error: null as string | null,
    onSave: vi.fn().mockResolvedValue(true),
    onSignOut: vi.fn(),
    ...overrides,
  };
  render(<AccountSection {...props} />);
  return props;
}

describe('AccountSection', () => {
  it('shows the saved name, Sign out, and no heading or Back of its own', () => {
    profile();
    expect(screen.getByLabelText('Your name')).toHaveValue('Anna');
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Back' })).not.toBeInTheDocument();
  });

  it('saves the trimmed name and says so', async () => {
    const user = userEvent.setup();
    const props = profile();
    await user.clear(screen.getByLabelText('Your name'));
    await user.type(screen.getByLabelText('Your name'), '  Anna Lee ');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(props.onSave).toHaveBeenCalledWith('Anna Lee');
    expect(await screen.findByText('Your name is saved.')).toBeInTheDocument();
  });

  it('asks for a name when it is blank and does not save', async () => {
    const user = userEvent.setup();
    const props = profile({ senderName: null });
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByText('Please enter your name.')).toBeInTheDocument();
    expect(props.onSave).not.toHaveBeenCalled();
  });

  it('keeps what was typed when the save fails', async () => {
    const user = userEvent.setup();
    profile({ onSave: vi.fn().mockResolvedValue(false), error: 'We couldn\'t save your name. You can try again.' });
    await user.type(screen.getByLabelText('Your name'), ' B');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument());
    expect(screen.getByLabelText('Your name')).toHaveValue('Anna B');
    expect(screen.getByText("We couldn't save your name. You can try again.")).toBeInTheDocument();
    expect(screen.queryByText('Your name is saved.')).not.toBeInTheDocument();
  });

  it('calls onSignOut', async () => {
    const user = userEvent.setup();
    const props = profile();
    await user.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(props.onSignOut).toHaveBeenCalledTimes(1);
  });

  it('shows the intro and no list for the name prompt, and the list otherwise', () => {
    const { unmount } = render(
      <AccountSection asksName senderName={null} error={null} onSave={vi.fn()} onSignOut={vi.fn()} />,
    );
    expect(screen.getByText('This is the name on your account.')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 2, name: "What you'll need" })).not.toBeInTheDocument();
    unmount();
    profile();
    expect(screen.getByRole('heading', { level: 2, name: "What you'll need" })).toBeInTheDocument();
  });

  it('shows the Settings actions under the account content when given, and none otherwise', async () => {
    const user = userEvent.setup();
    const onRemoveEverything = vi.fn().mockResolvedValue(undefined);
    const { unmount } = render(
      <AccountSection
        senderName="Anna"
        error={null}
        onSave={vi.fn()}
        onSignOut={vi.fn()}
        settings={{ onRemoveEverything, signsOut: true, removeMember: <h2>Remove a member</h2> }}
      />,
    );
    expect(screen.getByRole('heading', { level: 2, name: 'Remove a member' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Remove everything from this device' }));
    expect(screen.getByText(/You'll be signed out on this device/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Remove everything' }));
    expect(onRemoveEverything).toHaveBeenCalledTimes(1);
    unmount();
    profile();
    expect(screen.queryByRole('button', { name: 'Remove everything from this device' })).not.toBeInTheDocument();
  });

  it('describes the field by the intro and the status, and flags an error', () => {
    const { unmount } = render(
      <AccountSection asksName senderName={null} error="We couldn't save your name. You can try again." onSave={vi.fn()} onSignOut={vi.fn()} />,
    );
    const field = screen.getByLabelText('Your name');
    const ids = (field.getAttribute('aria-describedby') ?? '').split(' ');
    expect(ids).toHaveLength(2);
    expect(document.getElementById(ids[0])).toHaveTextContent('This is the name on your account.');
    expect(document.getElementById(ids[1])).toHaveTextContent("We couldn't save your name");
    expect(field).toHaveAttribute('aria-invalid', 'true');
    unmount();
    profile();
    expect(screen.getByLabelText('Your name')).not.toHaveAttribute('aria-invalid');
  });

  it('shows the people helping node under the form', () => {
    profile({ peopleHelping: <h2>People helping you</h2> });
    expect(screen.getByRole('heading', { level: 2, name: 'People helping you' })).toBeInTheDocument();
  });
});

describe('AccountSettingsSection', () => {
  it('confirms before removing, then removes', async () => {
    const user = userEvent.setup();
    const onRemoveEverything = vi.fn().mockResolvedValue(undefined);
    render(<AccountSettingsSection onRemoveEverything={onRemoveEverything} removeMember={<h2>Remove a member</h2>} />);
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Back' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Remove a member' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Remove everything from this device' }));
    expect(onRemoveEverything).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Remove everything' }));
    expect(onRemoveEverything).toHaveBeenCalledTimes(1);
  });
});
