import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Sending } from './Sending';
import type { SendingCopy, SendingProps } from './Sending';

const copy: SendingCopy = {
  heading: 'Reaching people, one at a time',
  openMessages: 'Open Messages',
  skip: 'Skip',
  next: 'Next',
  done: 'Done',
  sent: 'Sent',
  skipped: 'Skipped',
  waiting: 'Waiting',
};

function setup(over: Partial<SendingProps> = {}) {
  const handlers = { onOpenMessages: vi.fn(), onShare: vi.fn(), onNext: vi.fn(), onSkip: vi.fn() };
  const props: SendingProps = {
    copy,
    intro: 'Each message opens in your own Messages app.',
    progress: 0,
    current: { position: '1 of 3', name: 'Aunt Carol', message: 'Margaret has died.', isLast: false },
    others: [
      { id: 'b', name: 'Bob Smith', status: 'waiting' },
      { id: 'd', name: 'Dana Lee', status: 'waiting' },
    ],
    handOff: null,
    shareLabel: 'Share',
    ...handlers,
    ...over,
  };
  render(<Sending {...props} />);
  return handlers;
}

describe('Sending', () => {
  it('has one h1, the progress, the person it is on and their message', () => {
    setup();
    expect(screen.getByRole('heading', { level: 1, name: 'Reaching people, one at a time' })).toBeInTheDocument();
    expect(screen.getByText('1 of 3')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Aunt Carol' })).toBeInTheDocument();
    expect(screen.getByText('Margaret has died.')).toBeInTheDocument();
  });

  it('lists the other people with where each stands', () => {
    setup({ others: [{ id: 'a', name: 'Bob Smith', status: 'sent' }, { id: 'b', name: 'Dana Lee', status: 'skipped' }, { id: 'c', name: 'Eve', status: 'waiting' }] });
    expect(screen.getByText('Sent')).toBeInTheDocument();
    expect(screen.getByText('Skipped')).toBeInTheDocument();
    expect(screen.getByText('Waiting')).toBeInTheDocument();
  });

  it('sends, shares and skips through the callbacks', async () => {
    const user = userEvent.setup();
    const h = setup();
    await user.click(screen.getByRole('button', { name: 'Open Messages' }));
    await user.click(screen.getByRole('button', { name: 'Share' }));
    await user.click(screen.getByRole('button', { name: 'Skip' }));
    expect(h.onOpenMessages).toHaveBeenCalledTimes(1);
    expect(h.onShare).toHaveBeenCalledTimes(1);
    expect(h.onSkip).toHaveBeenCalledTimes(1);
  });

  it('has no Share button when the app offers none', () => {
    setup({ onShare: undefined });
    expect(screen.queryByRole('button', { name: 'Share' })).toBeNull();
  });

  it('after a hand-off shows the note, Next, and Open Messages again', async () => {
    const user = userEvent.setup();
    const onAgain = vi.fn();
    const h = setup({ handOff: { note: 'Send it in Messages, then come back and tap Next.', again: 'Open Messages again', onAgain } });
    expect(screen.getByRole('status')).toHaveTextContent('Send it in Messages, then come back and tap Next.');
    expect(screen.queryByRole('button', { name: 'Open Messages' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('button', { name: 'Open Messages again' }));
    expect(h.onNext).toHaveBeenCalledTimes(1);
    expect(onAgain).toHaveBeenCalledTimes(1);
  });

  it('offers Done on the last person', () => {
    setup({
      current: { position: '3 of 3', name: 'Dana Lee', message: 'Hi', isLast: true },
      handOff: { note: 'n', again: 'Open Messages again', onAgain: vi.fn() },
    });
    expect(screen.getByRole('button', { name: 'Done' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Next' })).toBeNull();
  });

  it('keeps the status line in the page and shows an error there', () => {
    const { rerender } = renderStatus();
    expect(screen.getByRole('status')).toHaveTextContent('');
    rerender('That did not go through.');
    expect(screen.getByRole('status')).toHaveTextContent('That did not go through.');
  });
});

function renderStatus() {
  const base: SendingProps = {
    copy,
    intro: 'x',
    progress: 0,
    current: { position: '1 of 2', name: 'A', message: 'm', isLast: false },
    others: [],
    handOff: null,
    onOpenMessages: vi.fn(),
    onNext: vi.fn(),
    onSkip: vi.fn(),
  };
  const view = render(<Sending {...base} />);
  return { rerender: (error: string) => view.rerender(<Sending {...base} error={error} />) };
}
