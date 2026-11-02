import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Sending } from './Sending';
import type { SendingCopy, SendingProps } from './Sending';

const copy: SendingCopy = {
  heading: 'Reaching people, one at a time',
  checklist: "What you'll need",
  openMessages: 'Open Messages',
  skip: 'Skip',
  next: 'Next',
  done: 'Done',
  sent: 'Sent',
  skipped: 'Skipped',
  waiting: 'Waiting',
};

function base(over: Partial<SendingProps> = {}): SendingProps {
  return {
    copy,
    intro: 'Each message opens in your own Messages app.',
    progress: 0,
    current: { position: '1 of 3', name: 'Aunt Carol', message: 'Margaret has died.', isLast: false },
    others: [
      { id: 'b', name: 'Bob Smith', status: 'waiting' },
      { id: 'd', name: 'Dana Lee', status: 'waiting' },
    ],
    handOff: null,
    onOpenMessages: jest.fn(),
    onNext: jest.fn(),
    onSkip: jest.fn(),
    ...over,
  };
}

describe('Sending (mobile)', () => {
  it('shows a quiet Stop for now that calls onPress, and hides it when unset', () => {
    const onPress = jest.fn();
    const view = render(<Sending {...base({ stop: { label: 'Stop for now', note: 'People you told stay marked as told.', onPress } })} />);
    // The visible line is hidden from screen readers (the button reads it as its hint).
    expect(screen.getByText('People you told stay marked as told.', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Stop for now' }).props.accessibilityHint).toBe('People you told stay marked as told.');
    fireEvent.press(screen.getByRole('button', { name: 'Stop for now' }));
    expect(onPress).toHaveBeenCalledTimes(1);
    view.rerender(<Sending {...base()} />);
    expect(screen.queryByRole('button', { name: 'Stop for now' })).toBeNull();
  });

  it('lists the other people as a list of items', () => {
    render(<Sending {...base({ others: [{ id: 'b', name: 'Bob Smith', status: 'sent' }, { id: 'd', name: 'Dana Lee', status: 'waiting' }] })} />);
    expect(screen.UNSAFE_getAllByProps({ role: 'list' }).length).toBeGreaterThan(0);
    expect(screen.UNSAFE_getAllByProps({ role: 'listitem' }).filter((node) => typeof node.type === 'string')).toHaveLength(2);
  });

  it('labels each other-person row once as name and status', () => {
    render(<Sending {...base({ others: [{ id: 'b', name: 'Bob Smith', status: 'sent' }] })} />);
    expect(screen.getByLabelText('Bob Smith, Sent')).toBeTruthy();
  });

  it('does not repeat the hand-off note as a hint on Next, and shows it once as the status line', () => {
    render(<Sending {...base({ handOff: { note: 'Send it in Messages.', again: 'Again', onAgain: jest.fn() } })} />);
    expect(screen.getByRole('button', { name: 'Next' }).props.accessibilityHint).toBeUndefined();
    expect(screen.getAllByText('Send it in Messages.')).toHaveLength(1);
  });

  it('shows a labelled line for the person only when the app gives a note, and passes typing on', () => {
    const onChange = jest.fn();
    const note = { label: 'Add a line for Carol', optional: '(optional)', value: '', onChange };
    const view = render(<Sending {...base({ note })} />);
    fireEvent.changeText(screen.getByLabelText('Add a line for Carol (optional)'), 'x');
    expect(onChange).toHaveBeenCalledWith('x');
    view.rerender(<Sending {...base()} />);
    expect(screen.queryByLabelText('Add a line for Carol (optional)')).toBeNull();
  });
});
