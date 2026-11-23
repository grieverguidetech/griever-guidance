import { describe, expect, it, jest } from '@jest/globals';
import { useState } from 'react';
import type { ComponentRef, Ref } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { AccessibilityInfo, Keyboard, Platform, ScrollView, StyleSheet, TextInput } from 'react-native';
import { screenCopy } from '@griever/copy';
import { Text } from 'react-native';
import { MessageBox } from '../MessageBox';
import { spacing } from '@griever/tokens';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BAR_TEST_ID, ReadyToSend } from './ReadyToSend';
import { typeMessage } from '../../testing/messageBox';
import type { ReadyToSendProps } from './ReadyToSend';
import { tierOfButton } from '../buttonTier.testkit';

jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: jest.fn(() => ({ top: 0, bottom: 0, left: 0, right: 0 })) }));

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

const ready = screenCopy('phoneReady');
const copy = { ...screenCopy('review'), messageCaption: ready.messageCaption, messageEdit: ready.messageEdit, messageEditName: ready.messageEditName, messageDone: ready.messageDone, messageDoneName: ready.messageDoneName };

/** One tap on Edit: the box becomes editable. */
const edit = () => fireEvent.press(screen.getByRole('button', { name: 'Edit message' }));
const SUGGESTED = 'Anna has passed away.';

/** Holds the message the way the app does: edited when it differs from the suggested wording. */
function Harness({
  details,
  lead,
  onSend,
  tone = 'plain',
  share,
}: { details?: ReadyToSendProps['details']; lead?: string; onSend?: () => void; tone?: ReadyToSendProps['tone']; share?: ReadyToSendProps['share'] } = {}) {
  const [override, setOverride] = useState<string | null>(null);
  const message = override ?? SUGGESTED;
  return (
    <ReadyToSend
      copy={copy}
      heading="Announce the passing"
      kind="announcement"
      details={details}
      lead={lead}
      message={message}
      onMessageChange={setOverride}
      edited={override !== null}
      onUseSuggested={() => setOverride(null)}
      tone={tone}
      share={share}
      onToneChange={jest.fn()}
      changePeople={{ label: "Change who you're texting", onPress: jest.fn() }}
      sendLabel="Text 2 people"
      chooseLabel="Choose who to tell"
      note="One at a time, from your own number."
      hasRecipients
      onChoose={jest.fn()}
      onBack={jest.fn()}
      onSend={onSend ?? (() => undefined)}
    />
  );
}

describe('ReadyToSend: button tiers (#1065)', () => {
  it('draws the Softer tone toggle as secondary, with a different background on and off', () => {
    const background = () => {
      const node = screen.getByRole('button', { name: 'Softer tone' });
      return StyleSheet.flatten(typeof node.props.style === 'function' ? node.props.style({ pressed: false }) : node.props.style).backgroundColor;
    };
    const { unmount } = render(<Harness tone="plain" />);
    expect(tierOfButton('Softer tone')).toBe('secondary');
    const off = background();
    expect(screen.getByRole('button', { name: 'Softer tone' }).props.accessibilityState).toMatchObject({ selected: false });
    unmount();
    render(<Harness tone="softer" />);
    expect(background()).not.toBe(off);
    expect(screen.getByRole('button', { name: 'Softer tone' }).props.accessibilityState).toMatchObject({ selected: true });
  });

  it('draws Share as secondary', () => {
    render(<Harness share={{ label: 'Share', onPress: jest.fn() }} />);
    expect(tierOfButton('Share')).toBe('secondary');
  });
});

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

  it('draws the row with no toggle when the details have no label', () => {
    render(<Harness details={{ startOpen: true, render: details.render }} />);
    expect(screen.getByText('Details row')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Change details' })).toBeNull();
  });

  it('has no Edit wording or Done editing button', () => {
    render(<Harness />);
    expect(screen.queryByRole('button', { name: 'Edit wording' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Done editing' })).toBeNull();
  });
});

describe('ReadyToSend: Bring back my words (#654)', () => {
  it('is not shown before the suggested wording has been used', () => {
    render(<Harness />);
    expect(screen.queryByRole('button', { name: 'Bring back my words' })).toBeNull();
  });

  it('restores the last edit after "Use the suggested wording"', () => {
    render(<Harness />);
    edit();
    fireEvent.changeText(screen.getByLabelText('Your message'), 'My own words.');
    fireEvent.press(screen.getByRole('button', { name: 'Use the suggested wording' }));
    expect(screen.queryByText('My own words.')).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: 'Bring back my words' }));
    expect(screen.getByLabelText('Your message').props.value).toBe('My own words.');
    expect(screen.queryByRole('button', { name: 'Bring back my words' })).toBeNull();
  });

  it('goes away at the next edit', () => {
    render(<Harness />);
    edit();
    fireEvent.changeText(screen.getByLabelText('Your message'), 'My own words.');
    fireEvent.press(screen.getByRole('button', { name: 'Use the suggested wording' }));
    expect(screen.getByRole('button', { name: 'Bring back my words' })).toBeTruthy();
    fireEvent.changeText(screen.getByLabelText('Your message'), 'Something new.');
    expect(screen.queryByRole('button', { name: 'Bring back my words' })).toBeNull();
  });

  it('moves focus to Bring back after Use suggested, and back to Use suggested after Bring back', () => {
    const focus = jest.spyOn(AccessibilityInfo, 'setAccessibilityFocus').mockImplementation(() => undefined);
    render(<Harness />);
    edit();
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
    edit();
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

describe('ReadyToSend: the message box reads until Edit is tapped (#968)', () => {
  const doneName = { name: 'Done editing' };
  const editName = { name: 'Edit message' };

  it('shows the message as read-only text with its label and the caption under it', () => {
    render(<Harness />);
    expect(screen.UNSAFE_queryByType(TextInput)).toBeNull();
    expect(screen.getByText(SUGGESTED)).toBeTruthy();
    expect(screen.getByText('Your message')).toBeTruthy();
    expect(screen.getByText('Read it one last time and make any last changes.')).toBeTruthy();
    expect(screen.queryByRole('button', doneName)).toBeNull();
  });

  it('reads the label and then the words to a screen reader', () => {
    render(<Harness />);
    const text = screen.getByLabelText('Your message');
    expect(text.props.accessible).toBe(true);
    expect(text.props.accessibilityValue).toEqual({ text: SUGGESTED });
  });

  it('does not open an editor when the text or the label is tapped', () => {
    render(<Harness />);
    fireEvent.press(screen.getByText(SUGGESTED));
    fireEvent.press(screen.getByText('Your message'));
    expect(screen.UNSAFE_queryByType(TextInput)).toBeNull();
  });

  it('has an Edit button named for a screen reader, with a 44pt target', () => {
    render(<Harness />);
    const button = screen.getByRole('button', editName);
    expect(button).toBeTruthy();
    expect(screen.getByText('Edit')).toBeTruthy();
    const style = typeof button.props.style === 'function' ? button.props.style({ pressed: false }) : button.props.style;
    expect(StyleSheet.flatten(style)).toMatchObject({ minHeight: 44, minWidth: 44 });
  });

  it('one tap on Edit makes the box editable, focused, with the cursor at the start', () => {
    render(<Harness />);
    edit();
    const box = screen.getByLabelText('Your message');
    expect(box.type).toBe('TextInput');
    expect(box.props.multiline).toBe(true);
    expect(box.props.autoFocus).toBe(true);
    expect(box.props.selection).toEqual({ start: 0, end: 0 });
    expect(box.props.value).toBe(SUGGESTED);
    expect(screen.getByRole('button', doneName)).toBeTruthy();
    expect(screen.queryByRole('button', editName)).toBeNull();
    expect(screen.getByText('Done')).toBeTruthy();
  });

  it('keeps the box size and the caption link the same in both modes', () => {
    render(<Harness />);
    const reading = StyleSheet.flatten(screen.getByLabelText('Your message').props.style);
    expect(reading).toMatchObject({ minHeight: 132, fontSize: 15 });
    edit();
    const editing = StyleSheet.flatten(screen.getByLabelText('Your message').props.style);
    expect(editing).toMatchObject({ minHeight: 132, fontSize: 15 });
    expect(editing.numberOfLines).toBeUndefined();
    expect(editing.maxHeight).toBeUndefined();
  });

  it('one tap on Done returns to reading and closes the keyboard', () => {
    const dismiss = jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => undefined);
    render(<Harness />);
    edit();
    fireEvent.press(screen.getByRole('button', doneName));
    expect(dismiss).toHaveBeenCalledTimes(1);
    expect(screen.UNSAFE_queryByType(TextInput)).toBeNull();
    expect(screen.getByRole('button', editName)).toBeTruthy();
    dismiss.mockRestore();
  });

  it('returns to reading when the box loses focus', () => {
    render(<Harness />);
    edit();
    fireEvent(screen.getByLabelText('Your message'), 'blur');
    expect(screen.UNSAFE_queryByType(TextInput)).toBeNull();
    expect(screen.getByRole('button', editName)).toBeTruthy();
  });

  it('does not end editing on the blur that comes with pressing Done (web), and ends it on the press', () => {
    render(<Harness />);
    edit();
    fireEvent(screen.getByRole('button', doneName), 'pressIn');
    fireEvent(screen.getByLabelText('Your message'), 'blur');
    // Still the Done button, so the click that follows ends editing instead of starting it again.
    expect(screen.getByRole('button', doneName)).toBeTruthy();
    fireEvent.press(screen.getByRole('button', doneName));
    expect(screen.UNSAFE_queryByType(TextInput)).toBeNull();
  });

  it('releases the cursor after the first selection change, so typing moves it', () => {
    render(<Harness />);
    edit();
    const box = screen.getByLabelText('Your message');
    expect(box.props.selection).toEqual({ start: 0, end: 0 });
    fireEvent(box, 'selectionChange', { nativeEvent: { selection: { start: 0, end: 0 } } });
    expect(screen.getByLabelText('Your message').props.selection).toBeUndefined();
  });

  it('moves the screen reader to the Edit button after Done', () => {
    const focus = jest.spyOn(AccessibilityInfo, 'setAccessibilityFocus').mockImplementation(() => undefined);
    render(<Harness />);
    edit();
    focus.mockClear();
    fireEvent.press(screen.getByRole('button', doneName));
    expect(focus).toHaveBeenCalledTimes(1);
    expect(focus).toHaveBeenLastCalledWith(handleForButton('Edit message'));
    focus.mockRestore();
  });

  it('moves the screen reader to the reading text when a blur ends editing (a scroll closing the keyboard)', () => {
    const focus = jest.spyOn(AccessibilityInfo, 'setAccessibilityFocus').mockImplementation(() => undefined);
    render(<Harness />);
    edit();
    focus.mockClear();
    fireEvent(screen.getByLabelText('Your message'), 'blur');
    expect(focus).toHaveBeenCalledTimes(1);
    expect(focus).toHaveBeenLastCalledWith(handleForText(SUGGESTED));
    focus.mockRestore();
  });

  it('on Android the words are in the label, so TalkBack cannot drop them', () => {
    const original = Platform.OS;
    Platform.OS = 'android';
    try {
      render(<Harness />);
      const text = screen.getByLabelText(`Your message, ${SUGGESTED}`);
      expect(text.props.accessibilityValue).toBeUndefined();
    } finally {
      Platform.OS = original;
    }
  });

  it('on web the role-less reading text carries no label of its own', () => {
    const toggle = { edit: 'Edit', editName: 'Edit message', done: 'Done', doneName: 'Done editing' };
    const box = (value: string) => <MessageBox label="Your message" caption="Caption" toggle={toggle} value={value} onChangeText={jest.fn()} boxStyle={{}} />;
    // The Button's web code needs a DOM, so it mounts as native; only the text is then drawn as on web.
    const { rerender } = render(box(SUGGESTED));
    const original = Platform.OS;
    Platform.OS = 'web';
    try {
      rerender(box('Another line.'));
      expect(screen.getByText('Another line.').props.accessibilityLabel).toBeUndefined();
      expect(screen.getByText('Another line.').props['aria-labelledby']).toBeUndefined();
    } finally {
      Platform.OS = original;
    }
  });

  it('keeps the typed words across the toggle, as the message that goes on', () => {
    render(<Harness />);
    edit();
    fireEvent.changeText(screen.getByLabelText('Your message'), 'My own words.');
    fireEvent.press(screen.getByRole('button', doneName));
    expect(screen.getByText('My own words.')).toBeTruthy();
    edit();
    expect(screen.getByLabelText('Your message').props.value).toBe('My own words.');
    expect(screen.getByRole('button', { name: 'Use the suggested wording' })).toBeTruthy();
  });

  it('lets a scroll close the keyboard', () => {
    render(<Harness />);
    expect(screen.UNSAFE_getByType(ScrollView).props.keyboardDismissMode).toBe('on-drag');
  });

  it('tapping the label while editing focuses the box', () => {
    render(<Harness />);
    edit();
    const focus = jest.fn();
    (screen.UNSAFE_getByType(TextInput).instance as unknown as { focus: () => void }).focus = focus;
    fireEvent.press(screen.getByText('Your message'));
    expect(focus).toHaveBeenCalledTimes(1);
  });

  it('keeps the tone button and Use the suggested wording as they were', () => {
    render(<Harness />);
    expect(screen.getByRole('button', { name: 'Softer tone' })).toBeTruthy();
    edit();
    fireEvent.changeText(screen.getByLabelText('Your message'), 'My own words.');
    expect(screen.getByRole('button', { name: 'Use the suggested wording' })).toBeTruthy();
  });

  it('reads in order: heading, label, first-name line, box, caption, extras, then the actions', () => {
    render(<Harness lead="Dee," details={{ label: 'Change details', startOpen: false, render: () => null }} />);
    const text = JSON.stringify(screen.toJSON());
    const at = (needle: string) => text.indexOf(needle);
    const order = ['Your message', 'Dee,', 'Read it one last time', 'Softer tone', 'Change details'].map(at);
    expect(order.every((n) => n >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });
});

describe('ReadyToSend: the send bar waits while the message is edited (#985)', () => {
  const sendName = { name: 'Text 2 people' };

  it('shows the bar while the message is read', () => {
    render(<Harness />);
    expect(screen.getByTestId(BAR_TEST_ID)).toBeTruthy();
    expect(screen.getByRole('button', sendName)).toBeTruthy();
  });

  it('hides the bar after Edit and brings it back after Done, with the same label', () => {
    render(<Harness />);
    edit();
    expect(screen.queryByTestId(BAR_TEST_ID)).toBeNull();
    expect(screen.queryByRole('button', sendName)).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: 'Done editing' }));
    expect(screen.getByTestId(BAR_TEST_ID)).toBeTruthy();
    expect(screen.getByRole('button', sendName)).toBeTruthy();
  });

  it('keeps the typed words, and send is called after Done', () => {
    const onSend = jest.fn();
    render(<Harness onSend={onSend} />);
    typeMessage('My own words.');
    fireEvent.press(screen.getByRole('button', { name: 'Done editing' }));
    expect(screen.getByText('My own words.')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', sendName));
    expect(onSend).toHaveBeenCalledTimes(1);
  });

  it('brings the bar back when the box loses focus', () => {
    render(<Harness />);
    edit();
    expect(screen.queryByTestId(BAR_TEST_ID)).toBeNull();
    fireEvent(screen.getByLabelText('Your message'), 'blur');
    expect(screen.getByRole('button', sendName)).toBeTruthy();
  });

  it('ends editing and brings the bar back when the keyboard hides (Android back)', () => {
    let hideKeyboard = () => {};
    const add = jest.spyOn(Keyboard, 'addListener').mockImplementation(((event: string, handler: () => void) => {
      if (event === 'keyboardDidHide') {
        hideKeyboard = handler;
      }
      return { remove: jest.fn() };
    }) as unknown as typeof Keyboard.addListener);
    render(<Harness />);
    edit();
    expect(screen.queryByTestId(BAR_TEST_ID)).toBeNull();
    act(() => {
      hideKeyboard();
    });
    expect(screen.UNSAFE_queryByType(TextInput)).toBeNull();
    expect(screen.getByRole('button', sendName)).toBeTruthy();
    add.mockRestore();
  });

  it('shows the same note and reason after Done as before Edit', () => {
    render(<Harness />);
    expect(screen.getByText('One at a time, from your own number.')).toBeTruthy();
    edit();
    fireEvent.press(screen.getByRole('button', { name: 'Done editing' }));
    expect(screen.getByText('One at a time, from your own number.')).toBeTruthy();
    expect(screen.getByRole('button', sendName).props.accessibilityState?.disabled).toBeFalsy();
  });

  it('says the blank-message reason once when Done brings the bar back, and not on first render', () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => undefined);
    render(<Harness />);
    expect(announce).not.toHaveBeenCalledWith(copy.blank);
    typeMessage('   ');
    fireEvent.press(screen.getByRole('button', { name: 'Done editing' }));
    expect(announce.mock.calls.filter(([said]) => said === copy.blank)).toHaveLength(1);
    announce.mockRestore();
  });

  it('pads the content by the safe-area inset only while the bar is hidden', () => {
    jest.mocked(useSafeAreaInsets).mockReturnValue({ top: 0, bottom: 34, left: 0, right: 0 });
    try {
      render(<Harness />);
      const padding = () => StyleSheet.flatten(screen.UNSAFE_getByType(ScrollView).props.contentContainerStyle).paddingBottom;
      expect(padding()).toBeUndefined();
      edit();
      expect(padding()).toBe(spacing[3] + 34);
      fireEvent.press(screen.getByRole('button', { name: 'Done editing' }));
      expect(padding()).toBeUndefined();
    } finally {
      jest.mocked(useSafeAreaInsets).mockReturnValue({ top: 0, bottom: 0, left: 0, right: 0 });
    }
  });
});
