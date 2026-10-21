import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { accountStore } from '@griever/data-local';
import { Profile } from './Profile';
import { WhatYoullNeed } from './WhatYoullNeed';

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

  it('blocks a name of only spaces', async () => {
    const onSave = vi.fn(async () => true);
    const user = userEvent.setup();
    render(<Profile senderName={null} onBack={vi.fn()} onSave={onSave} onSignOut={vi.fn()} error={null} />);
    await user.type(screen.getByLabelText('Your name'), '  ');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText('Please enter your name.')).toBeInTheDocument();
  });

  it('asks what to call the person when the account has no name', () => {
    render(<Profile asksName senderName={null} onBack={vi.fn()} onSave={vi.fn()} onSignOut={vi.fn()} error={null} />);
    expect(screen.getByRole('heading', { level: 1, name: 'What should we call you?' })).toBeInTheDocument();
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

  it('first-time mode shows a primary Continue that calls onContinue without saving', async () => {
    const onContinue = vi.fn();
    const onSave = vi.fn(async () => true);
    const user = userEvent.setup();
    render(
      <Profile firstTime onContinue={onContinue} senderName="Anna" onBack={vi.fn()} onSave={onSave} onSignOut={vi.fn()} error={null} />,
    );
    expect(screen.getByRole('heading', { level: 1, name: 'Your account' })).toBeInTheDocument();
    await user.type(screen.getByLabelText('Your name'), ' Reyes');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(onContinue).toHaveBeenCalledWith('Anna Reyes');
    expect(onSave).not.toHaveBeenCalled();
    // One primary action: no Save and no Sign out here.
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sign out' })).not.toBeInTheDocument();
  });

  it('first-time mode describes the field and keeps a failed-save note in the live region', () => {
    render(
      <Profile firstTime saveFailed onContinue={vi.fn()} senderName="Anna" onBack={vi.fn()} onSave={vi.fn()} onSignOut={vi.fn()} error={null} />,
    );
    const field = screen.getByLabelText('Your name');
    expect(field).toHaveAccessibleDescription(/name on your account/);
    const note = screen.getByText("We couldn't save your name. You can try again.");
    expect(note).toHaveAttribute('aria-live', 'polite');
  });

  it('the existing mode has no Continue', () => {
    render(<Profile senderName="Anna" onBack={vi.fn()} onSave={vi.fn()} onSignOut={vi.fn()} error={null} />);
    expect(screen.queryByRole('button', { name: 'Continue' })).not.toBeInTheDocument();
  });

  it('renders the optional slot only when one is passed', () => {
    const props = { senderName: 'Anna', onBack: vi.fn(), onSave: vi.fn(), onSignOut: vi.fn(), error: null };
    const { rerender } = render(<Profile {...props} />);
    expect(screen.queryByText('slot content')).not.toBeInTheDocument();
    rerender(<Profile {...props} peopleHelping={<p>slot content</p>} />);
    expect(screen.getByText('slot content')).toBeInTheDocument();
    expect(screen.getByLabelText('Your name')).toHaveValue('Anna');
  });

  describe('What you will need on Your account (#191)', () => {
    const props = { senderName: 'Anna', onBack: vi.fn(), onSave: vi.fn(), onSignOut: vi.fn(), error: null };
    const row = (label: string) => screen.getByRole('button', { name: new RegExp(label) });
    const ready = () => waitFor(() => expect(row('Life insurance policies')).toBeEnabled());

    it('lists the items with aria-pressed and at least 44px rows', async () => {
      render(<Profile {...props} />);
      await ready();
      expect(screen.getByRole('heading', { level: 2, name: "What you'll need" })).toBeInTheDocument();
      expect(row('Any will or written wishes')).toHaveAttribute('aria-pressed', 'false');
      expect(row('Military discharge papers')).toHaveClass('min-h-[44px]');
    });

    it('drops the top-bar checklist button, since the list is on the page', async () => {
      render(<Profile {...props} />);
      await ready();
      expect(screen.queryByRole('button', { name: "What you'll need" })).not.toBeInTheDocument();
    });

    it('hides the list when the session has ended', () => {
      render(<Profile {...props} showChecklist={false} />);
      expect(screen.queryByRole('heading', { level: 2, name: "What you'll need" })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: "What you'll need" })).toBeInTheDocument();
    });

    it('is left out of the name prompt and the first visit', () => {
      const { rerender } = render(<Profile {...props} asksName />);
      expect(screen.queryByRole('heading', { level: 2, name: "What you'll need" })).not.toBeInTheDocument();
      rerender(<Profile {...props} firstTime onContinue={vi.fn()} />);
      expect(screen.queryByRole('heading', { level: 2, name: "What you'll need" })).not.toBeInTheDocument();
    });

    it('shows a tick made here in the checklist screen, and the reverse', async () => {
      const user = userEvent.setup();
      const account = render(<Profile {...props} />);
      await ready();
      await user.click(row('Life insurance policies'));
      expect(row('Life insurance policies')).toHaveAttribute('aria-pressed', 'true');
      await waitFor(async () => expect(await accountStore.getChecklistTicks()).toContain('life-insurance'));
      account.unmount();

      const list = render(<WhatYoullNeed onBack={vi.fn()} onEmailList={vi.fn()} />);
      await waitFor(() => expect(row('Life insurance policies')).toBeEnabled());
      expect(row('Life insurance policies')).toHaveAttribute('aria-pressed', 'true');
      await user.click(row('Military discharge papers'));
      await waitFor(async () => expect(await accountStore.getChecklistTicks()).toContain('military-papers'));
      list.unmount();

      render(<Profile {...props} />);
      await ready();
      expect(row('Military discharge papers')).toHaveAttribute('aria-pressed', 'true');
    });
  });
});
