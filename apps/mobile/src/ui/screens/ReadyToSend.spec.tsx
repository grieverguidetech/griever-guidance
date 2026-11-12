import { describe, expect, it, jest } from '@jest/globals';
import { useState } from 'react';
import type { ComponentRef, Ref } from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';
import { screenCopy } from '@griever/copy';
import { Text } from 'react-native';
import { ReadyToSend } from './ReadyToSend';
import type { ReadyToSendProps } from './ReadyToSend';

// Jest has no native view tree, so findNodeHandle returns null. A fake handle per node shows where focus went.
const mockHandles = new Map<unknown, number>();
jest.mock('react-native/Libraries/ReactNative/RendererProxy', () => ({
  ...jest.requireActual<object>('react-native/Libraries/ReactNative/RendererProxy'),
  findNodeHandle: (node: unknown) => {
    if (!node) {
      return null;
    }
    if (!mockHandles.has(node)) {
      mockHandles.set(node, mockHandles.size + 1);
    }
    return mockHandles.get(node);
  },
}));

// The handle of the node a button's ref points at, found by matching the button's own children.
const handleForButton = (name: string): number => {
  const { children } = screen.getByRole('button', { name }).props;
  let found: number | undefined;
  for (const [node, handle] of mockHandles) {
    if ((node as { props?: { children?: unknown } }).props?.children === children) {
      found = handle;
    }
  }
  if (found === undefined) {
    throw new Error(`No focus handle for button ${name}`);
  }
  return found;
};

// The handle of the node a text line's ref points at, found by matching the line's own children.
const handleForText = (text: string): number => {
  let found: number | undefined;
  for (const [node, handle] of mockHandles) {
    if ((node as { props?: { children?: unknown } }).props?.children === text) {
      found = handle;
    }
  }
  if (found === undefined) {
    throw new Error(`No focus handle for text ${text}`);
  }
  return found;
};

const copy = screenCopy('review');
const SUGGESTED = 'Anna has passed away.';

/** Holds the message the way the app does: edited when it differs from the suggested wording. */
function Harness({ details }: { details?: ReadyToSendProps['details'] } = {}) {
  const [override, setOverride] = useState<string | null>(null);
  const message = override ?? SUGGESTED;
  return (
    <ReadyToSend
      copy={copy}
      heading="Announce the passing"
      kind="announcement"
      details={details}
      message={message}
      onMessageChange={setOverride}
      edited={override !== null}
      onUseSuggested={() => setOverride(null)}
      tone="plain"
      onToneChange={jest.fn()}
      changePeople={{ label: 'Change who gets this', onPress: jest.fn() }}
      sendLabel="Text 2 people"
      chooseLabel="Choose who to tell"
      note="One at a time, from your own number."
      hasRecipients
      onChoose={jest.fn()}
      onBack={jest.fn()}
      onSend={jest.fn()}
    />
  );
}

describe('ReadyToSend: Change details', () => {
  const details = {
    label: 'Change details',
    startOpen: false,
    render: (headingRef: Ref<ComponentRef<typeof Text>>) => (
      <Text ref={headingRef} accessibilityRole="header">
        Details row
      </Text>
    ),
  };

  it('reads expanded or not, opens in place, and moves focus to the row', () => {
    const focus = jest.spyOn(AccessibilityInfo, 'setAccessibilityFocus').mockImplementation(() => undefined);
    render(<Harness details={details} />);
    expect(screen.getByRole('button', { name: 'Change details' }).props.accessibilityState).toMatchObject({ expanded: false });
    expect(screen.queryByText('Details row')).toBeNull();
    focus.mockClear();
    fireEvent.press(screen.getByRole('button', { name: 'Change details' }));
    expect(screen.getByText('Details row')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Change details' }).props.accessibilityState).toMatchObject({ expanded: true });
    expect(focus).toHaveBeenCalledTimes(1);
    expect(focus).toHaveBeenLastCalledWith(handleForText('Details row'));
    fireEvent.press(screen.getByRole('button', { name: 'Change details' }));
    expect(screen.queryByText('Details row')).toBeNull();
    expect(focus).toHaveBeenCalledTimes(1);
    focus.mockRestore();
  });

  it('Edit wording reads expanded or not', () => {
    render(<Harness />);
    expect(screen.getByRole('button', { name: 'Edit wording' }).props.accessibilityState).toMatchObject({ expanded: false });
    fireEvent.press(screen.getByRole('button', { name: 'Edit wording' }));
    expect(screen.getByRole('button', { name: 'Done editing' }).props.accessibilityState).toMatchObject({ expanded: true });
  });
});

describe('ReadyToSend: Bring back my words (#654)', () => {
  it('is not shown before the suggested wording has been used', () => {
    render(<Harness />);
    expect(screen.queryByRole('button', { name: 'Bring back my words' })).toBeNull();
  });

  it('restores the last edit after "Use the suggested wording"', () => {
    render(<Harness />);
    fireEvent.press(screen.getByRole('button', { name: 'Edit wording' }));
    fireEvent.changeText(screen.getByLabelText('Your message'), 'My own words.');
    fireEvent.press(screen.getByRole('button', { name: 'Use the suggested wording' }));
    expect(screen.queryByText('My own words.')).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: 'Bring back my words' }));
    expect(screen.getByLabelText('Your message').props.value).toBe('My own words.');
    expect(screen.queryByRole('button', { name: 'Bring back my words' })).toBeNull();
  });

  it('goes away at the next edit', () => {
    render(<Harness />);
    fireEvent.press(screen.getByRole('button', { name: 'Edit wording' }));
    fireEvent.changeText(screen.getByLabelText('Your message'), 'My own words.');
    fireEvent.press(screen.getByRole('button', { name: 'Use the suggested wording' }));
    expect(screen.getByRole('button', { name: 'Bring back my words' })).toBeTruthy();
    fireEvent.changeText(screen.getByLabelText('Your message'), 'Something new.');
    expect(screen.queryByRole('button', { name: 'Bring back my words' })).toBeNull();
  });

  it('moves focus to Bring back after Use suggested, and back to Use suggested after Bring back', () => {
    const focus = jest.spyOn(AccessibilityInfo, 'setAccessibilityFocus').mockImplementation(() => undefined);
    render(<Harness />);
    fireEvent.press(screen.getByRole('button', { name: 'Edit wording' }));
    fireEvent.changeText(screen.getByLabelText('Your message'), 'My own words.');
    focus.mockClear();
    fireEvent.press(screen.getByRole('button', { name: 'Use the suggested wording' }));
    expect(focus).toHaveBeenLastCalledWith(handleForButton('Bring back my words'));
    expect(focus).toHaveBeenCalledTimes(1);
    focus.mockClear();
    fireEvent.press(screen.getByRole('button', { name: 'Bring back my words' }));
    expect(focus).toHaveBeenLastCalledWith(handleForButton('Use the suggested wording'));
    expect(focus).toHaveBeenCalledTimes(1);
    focus.mockRestore();
  });

  it('says what changed, politely', () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => undefined);
    render(<Harness />);
    fireEvent.press(screen.getByRole('button', { name: 'Edit wording' }));
    fireEvent.changeText(screen.getByLabelText('Your message'), 'My own words.');
    announce.mockClear();
    fireEvent.press(screen.getByRole('button', { name: 'Use the suggested wording' }));
    expect(announce).toHaveBeenLastCalledWith('Suggested wording in place.');
    expect(screen.getByText('Suggested wording in place.').props.accessibilityLiveRegion).toBe('polite');
    fireEvent.press(screen.getByRole('button', { name: 'Bring back my words' }));
    expect(announce).toHaveBeenLastCalledWith('Your words are back.');
    announce.mockRestore();
  });
});
