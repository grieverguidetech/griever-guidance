import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Join } from './Join';
import type { JoinPhase } from './Join';

function show(phase: JoinPhase) {
  const handlers = { onCreateAccount: vi.fn(), onSignIn: vi.fn(), onContinue: vi.fn() };
  const view = render(<Join phase={phase} {...handlers} />);
  return { ...handlers, ...view };
}

describe('Join', () => {
  it('invited: says what is asked, focuses the h1, and offers both ways in', async () => {
    const { onCreateAccount, onSignIn } = show('invited');
    const heading = screen.getByRole('heading', { level: 1, name: "You've been asked to help" });
    expect(heading).toHaveFocus();
    expect(screen.getByText('Create an account, or sign in, to help let people know.')).toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Create an account' }));
    await user.click(screen.getByRole('button', { name: 'I already have an account' }));
    expect(onCreateAccount).toHaveBeenCalledTimes(1);
    expect(onSignIn).toHaveBeenCalledTimes(1);
  });

  it('joining: a status, no h1 and no buttons', () => {
    show('joining');
    expect(screen.getByRole('status')).toHaveTextContent('Joining…');
    expect(screen.queryByRole('heading')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('unusable: one calm message with Continue', async () => {
    const { onContinue } = show('unusable');
    expect(screen.getByRole('heading', { level: 1, name: "This invitation can't be used" })).toHaveFocus();
    expect(screen.getByText('Ask the person who sent it for a new one.')).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Continue' }));
    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  it('offline: says the link is saved, with Continue', () => {
    show('offline');
    expect(screen.getByRole('heading', { level: 1, name: 'You need a connection to join' })).toHaveFocus();
    expect(screen.getByText("Your link is saved; open the app again when you're connected.")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeInTheDocument();
  });

  it('moves focus to the new h1 when the phase changes', () => {
    const handlers = { onCreateAccount: vi.fn(), onSignIn: vi.fn(), onContinue: vi.fn() };
    const { rerender } = render(<Join phase="joining" {...handlers} />);
    rerender(<Join phase="unusable" {...handlers} />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveFocus();
  });

  it.each<JoinPhase>(['invited', 'unusable', 'offline'])('%s: buttons use the 44px button class, and no exclamation points', (phase) => {
    show(phase);
    for (const button of screen.getAllByRole('button')) {
      expect(button).toHaveClass('gg-btn');
    }
    expect(document.body.textContent).not.toContain('!');
  });
});
