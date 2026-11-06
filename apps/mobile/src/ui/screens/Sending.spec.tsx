import { describe, expect, it, jest } from '@jest/globals';
import { StyleSheet } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { ActionBar } from '../ActionBar';
import { Sending } from './Sending';
import type { SendingCopy, SendingProps } from './Sending';

const copy: SendingCopy = {
  openMessages: 'Open Messages',
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
    segments: ['current', 'waiting', 'waiting'],
    skipLabel: 'Skip Aunt Carol',
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
  it('shows Stop for now in the top bar beside the position, and hides it when unset', () => {
    const onPress = jest.fn();
    const view = render(<Sending {...base({ stop: { label: 'Stop for now', note: 'People you told stay marked as told.', line: 'You can stop any time.', onPress } })} />);
    expect(screen.getByRole('button', { name: 'Stop for now' }).props.accessibilityHint).toBe('People you told stay marked as told.');
    expect(screen.getByText('1 of 3')).toBeTruthy();
    expect(screen.getByText('You can stop any time.', { includeHiddenElements: true })).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Stop for now' }));
    expect(onPress).toHaveBeenCalledTimes(1);
    view.rerender(<Sending {...base()} />);
    expect(screen.queryByRole('button', { name: 'Stop for now' })).toBeNull();
  });

  it('draws one progress segment per person and hides the strip from screen readers', () => {
    render(<Sending {...base({ segments: ['done', 'current', 'waiting'] })} />);
    const strip = screen.UNSAFE_getAllByProps({ importantForAccessibility: 'no-hide-descendants' }).find((node) => typeof node.type === 'string');
    expect(strip?.props.accessibilityElementsHidden).toBe(true);
    expect(strip?.props.children).toHaveLength(3);
  });

  it('shows the name as the page heading at 28 points or more', () => {
    render(<Sending {...base()} />);
    const name = screen.getByRole('heading', { name: 'Aunt Carol' });
    expect(StyleSheet.flatten(name.props.style).fontSize).toBeGreaterThanOrEqual(28);
  });

  it('puts the hand-off in the bottom bar, with Skip above it', () => {
    const onOpenMessages = jest.fn();
    render(<Sending {...base({ onOpenMessages, openLabel: 'Text Aunt Carol' })} />);
    fireEvent.press(screen.getByRole('button', { name: 'Text Aunt Carol' }));
    expect(onOpenMessages).toHaveBeenCalledTimes(1);
    expect(screen.UNSAFE_getByType(ActionBar).props.label).toBe('Text Aunt Carol');
    expect(screen.getByRole('button', { name: 'Skip Aunt Carol' })).toBeTruthy();
  });

  it('after a hand-off the bar reads Next (Done on the last person) with Open Messages again above', () => {
    const view = render(<Sending {...base({ handOff: { note: 'Send it in Messages.', again: 'Open Messages again', onAgain: jest.fn() } })} />);
    expect(screen.UNSAFE_getByType(ActionBar).props.label).toBe('Next');
    expect(screen.getByRole('button', { name: 'Open Messages again' })).toBeTruthy();
    view.rerender(<Sending {...base({ current: { position: '3 of 3', name: 'Dana Lee', message: 'm', isLast: true }, handOff: { note: 'n', again: 'Open Messages again', onAgain: jest.fn() } })} />);
    expect(screen.UNSAFE_getByType(ActionBar).props.label).toBe('Done');
  });

  it('lists the other people as a list of items', () => {
    render(<Sending {...base({ others: [{ id: 'b', name: 'Bob Smith', status: 'sent' }, { id: 'd', name: 'Dana Lee', status: 'waiting' }] })} />);
    expect(screen.UNSAFE_getAllByProps({ role: 'list' }).filter((node) => typeof node.type === 'string')).toHaveLength(1);
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
    const status = screen.UNSAFE_getAllByProps({ role: 'status' }).filter((node) => typeof node.type === 'string');
    expect(status).toHaveLength(1);
    expect(status[0].props.accessibilityLiveRegion).toBe('polite');
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
