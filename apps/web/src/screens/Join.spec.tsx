import { act, render, screen } from '@testing-library/react';
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

  it('joining: a polite status that is in the page empty first, then says Joining (so it is announced)', () => {
    vi.useFakeTimers();
    try {
      show('joining');
      const status = screen.getByRole('status');
      expect(status).toHaveAttribute('aria-live', 'polite');
      expect(status).toHaveTextContent('');
      act(() => {
        vi.advanceTimersByTime(50);
      });
      expect(status).toHaveTextContent('Joining…');
    } finally {
      vi.useRealTimers();
    }
    expect(screen.queryByRole('heading')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it.each<[JoinPhase, string, string]>([
    ['unusable', "This invitation can't be used", 'Ask the person who sent it for a new one.'],
    ['conflict', "This invitation can't be joined", "You already have your own people in this account, so this invitation can't be joined from it."],
    ['offline', 'You need a connection to join', "Your link is saved. Open the app again when you're connected."],
    ['later', "Joining isn't available right now", 'Your link is saved. Open the app again in a little while to try again.'],
  ])('%s: its own h1, focused, one calm line, and Continue', async (phase, heading, body) => {
    const { onContinue } = show(phase);
    expect(screen.getByRole('heading', { level: 1, name: heading })).toHaveFocus();
    expect(screen.getByText(body)).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Continue' }));
    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  it('moves focus to the new h1 when the phase changes', () => {
    const handlers = { onCreateAccount: vi.fn(), onSignIn: vi.fn(), onContinue: vi.fn() };
    const { rerender } = render(<Join phase="joining" {...handlers} />);
    rerender(<Join phase="unusable" {...handlers} />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveFocus();
  });

  it.each<JoinPhase>(['invited', 'unusable', 'conflict', 'offline', 'later'])('%s: buttons use the 44px button class, and no exclamation points', (phase) => {
    show(phase);
    for (const button of screen.getAllByRole('button')) {
      expect(button).toHaveClass('gg-btn');
    }
    expect(document.body.textContent).not.toContain('!');
  });
});
