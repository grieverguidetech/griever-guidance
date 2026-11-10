import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { useState } from 'react';
import { AccessibilityInfo, BackHandler, Keyboard, KeyboardAvoidingView, Linking, Modal, Platform, Share, StyleSheet } from 'react-native';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Session } from '@griever/hooks';
import { CHECKLIST_PHASES } from '@griever/shared';
import { SerifReadyContext } from '../ui';
import * as Clipboard from 'expo-clipboard';
import { ShareObituaryScreen } from './ShareObituaryScreen';
import { obituaryTextFor } from '../lib/obituaryText';
import * as MailComposer from 'expo-mail-composer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { publisherEmailKey } from '../lib/mailCompose';

jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(), getStringAsync: jest.fn() }));

jest.mock('react-native/Libraries/ReactNative/RendererProxy', () => ({
  ...jest.requireActual<object>('react-native/Libraries/ReactNative/RendererProxy'),
  // A distinct handle per node, so a test can tell which node got screen-reader focus.
  findNodeHandle: (node: unknown) => {
    const g = globalThis as unknown as { nodeHandles?: Map<unknown, number> };
    g.nodeHandles ??= new Map();
    if (!g.nodeHandles.has(node)) {
      g.nodeHandles.set(node, g.nodeHandles.size + 1);
    }
    return g.nodeHandles.get(node);
  },
}));

// The node that got the last screen-reader focus call, looked up from the handle the fake gave it.
const focusedNode = (focus: jest.SpiedFunction<typeof AccessibilityInfo.setAccessibilityFocus>) => {
  const handle = focus.mock.calls.at(-1)?.[0];
  const handles = (globalThis as unknown as { nodeHandles: Map<any, number> }).nodeHandles;
  return [...handles].find(([, h]) => h === handle)?.[0];
};

// The focused node is the host view of a button when it has the same press handler as the button the user sees.
const isButton = (node: any, name: string) => {
  const button = screen.getByRole('button', { name });
  return node?.props?.role === 'button' && typeof node.props.onClick === 'function' && node.props.onClick === button.props.onClick;
};

// The focused node is the host view of the What you'll need button: the same press handler as the button the user sees.
const isChecklistButton = (node: any) => {
  const button = screen.getByRole('button', { name: "What you'll need" });
  return node?.props?.role === 'button' && typeof node.props.onClick === 'function' && node.props.onClick === button.props.onClick;
};

const base = {
  id: 'a', flowId: 'flow-a', ownerId: null, role: 'owner', personName: 'Anna', dateOfPassing: '', senderName: '', obituaryUrl: '',
  createdAt: '2026-10-01T00:00:00.000Z', lastOpenedAt: '2026-10-01T00:00:00.000Z',
  drafts: {}, serviceReady: false, recipientsNotified: {}, momentCompletedAt: {}, remindersScheduled: [],
} as unknown as Session;

const BUTTON = 'Email it to the paper or funeral home';
const OPENED = "Opened in your email app. Tap Done when you have sent it.";
const SHARED = "Shared from your phone. Tap Done when you have sent it.";

function setup(session: Session, onChange = jest.fn(), onSetItem = jest.fn(), onEmailed = jest.fn()) {
  render(
    <SerifReadyContext.Provider value>
      <ShareObituaryScreen session={session} onChange={onChange} onSetItem={onSetItem} onBack={jest.fn()} onContinue={jest.fn()} onEmailed={onEmailed} />
    </SerifReadyContext.Provider>,
  );
}

// React Native's jest setup already mocks Linking, so spies keep their calls between tests unless cleared.
beforeEach(() => {
  jest.clearAllMocks();
  (globalThis as unknown as { nodeHandles?: Map<unknown, number> }).nodeHandles?.clear();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('ShareObituaryScreen step 1 (email the publisher)', () => {
  it('shows the button only when there is obituary text', () => {
    setup({ ...base, obituaryText: 'Anna loved the garden.' } as Session);
    expect(screen.getByRole('button', { name: BUTTON })).toBeTruthy();
  });

  it('shows one calm line above Email while [brackets] remain, and Email and Copy still work', async () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    jest.mocked(Clipboard.setStringAsync).mockResolvedValue(true);
    const session = { ...base, personName: 'Anna Lee', obituaryCity: 'Tulsa' } as Session;
    setup(session);
    expect(screen.getByText('Some parts are still in [brackets]. Fill them in or delete them before you send.')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: BUTTON }));
    await waitFor(() => expect(open).toHaveBeenCalledTimes(1));
    fireEvent.press(screen.getByRole('button', { name: 'Copy the text' }));
    await waitFor(() => expect(Clipboard.setStringAsync).toHaveBeenCalledWith(obituaryTextFor(session)));
  });

  it('gives the Email button the blanks line as its hint', () => {
    setup({ ...base, personName: 'Anna Lee', obituaryCity: 'Tulsa' } as Session);
    expect(screen.getByRole('button', { name: BUTTON }).props.accessibilityHint).toBe('Some parts are still in [brackets]. Fill them in or delete them before you send.');
  });

  it('shows no brackets line when the text has none', () => {
    setup({ ...base, obituaryText: 'Anna loved the garden [my note].' } as Session);
    expect(screen.queryByText(/still in \[brackets\]/)).toBeNull();
    expect(screen.getByRole('button', { name: BUTTON }).props.accessibilityHint).toBeUndefined();
    expect(screen.getByRole('button', { name: BUTTON })).toBeTruthy();
  });

  it('with no text, says it can be written on the web and still lets the user continue to the link field', () => {
    setup(base);
    expect(screen.queryByRole('button', { name: BUTTON })).toBeNull();
    expect(screen.getByText("Write it above, or on the web.")).toBeTruthy();
    expect(screen.getByLabelText('Link to the obituary')).toBeTruthy();
  });

  it('treats blank text as no text', () => {
    setup({ ...base, obituaryText: '   ' } as Session);
    expect(screen.queryByRole('button', { name: BUTTON })).toBeNull();
  });

  it('opens a mailto: with the subject and the text as the body, and no recipient', async () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    setup({ ...base, obituaryText: 'Anna loved the garden.' } as Session);
    fireEvent.press(screen.getByRole('button', { name: BUTTON }));
    await waitFor(() => expect(open).toHaveBeenCalledTimes(1));
    const url = String(open.mock.calls[0][0]);
    expect(url.startsWith('mailto:?')).toBe(true);
    expect(decodeURIComponent(url)).toBe('mailto:?subject=Obituary for Anna&body=Anna loved the garden.');
  });

  it('encodes &, # and a new line in the body exactly', async () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    setup({ ...base, obituaryText: 'Anna & Bob #1\nLine two' } as Session);
    fireEvent.press(screen.getByRole('button', { name: BUTTON }));
    await waitFor(() => expect(open).toHaveBeenCalledTimes(1));
    expect(open).toHaveBeenCalledWith('mailto:?subject=Obituary%20for%20Anna&body=Anna%20%26%20Bob%20%231%0D%0ALine%20two');
  });

  it('opens once when tapped twice quickly', async () => {
    let finish: () => void = () => undefined;
    const open = jest.spyOn(Linking, 'openURL').mockImplementation(() => new Promise<void>((resolve) => { finish = resolve; }));
    setup({ ...base, obituaryText: 'Text' } as Session);
    const button = screen.getByRole('button', { name: BUTTON });
    fireEvent.press(button);
    fireEvent.press(button);
    // Mail opens a moment later now (the composer is checked first).
    await waitFor(() => expect(open).toHaveBeenCalledTimes(1));
    finish();
    expect(open).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.getByRole('button', { name: BUTTON })).toBeTruthy());
  });

  it('opens the share sheet with the same text when mail cannot open', async () => {
    jest.spyOn(Linking, 'openURL').mockRejectedValue(new Error('no mail'));
    const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: Share.sharedAction, activityType: undefined });
    setup({ ...base, obituaryText: 'Anna loved the garden.' } as Session);
    fireEvent.press(screen.getByRole('button', { name: BUTTON }));
    await waitFor(() => expect(share).toHaveBeenCalledWith({ message: 'Anna loved the garden.', title: 'Obituary for Anna' }, { subject: 'Obituary for Anna' }));
  });

  it('says so calmly when mail and sharing both fail', async () => {
    jest.spyOn(Linking, 'openURL').mockRejectedValue(new Error('no mail'));
    jest.spyOn(Share, 'share').mockRejectedValue(new Error('no share'));
    setup({ ...base, obituaryText: 'Anna loved the garden.' } as Session);
    fireEvent.press(screen.getByRole('button', { name: BUTTON }));
    expect(await screen.findByText(/couldn't open email or sharing/)).toBeTruthy();
    // A repeat press clears the message first, so a repeat failure is announced again.
    fireEvent.press(screen.getByRole('button', { name: BUTTON }));
    expect(await screen.findByText(/couldn't open email or sharing/)).toBeTruthy();
  });
});

describe('ShareObituaryScreen two steps, paste and copy', () => {
  it('names the screen and both steps', () => {
    setup({ ...base, obituaryText: 'Text' } as Session);
    expect(screen.getByRole('heading', { name: 'Share the obituary' })).toBeTruthy();
    expect(screen.getByText('Step 1: email it to the publisher')).toBeTruthy();
    expect(screen.getByText("Step 2: once it's published, paste the link")).toBeTruthy();
  });

  it('shows no opened line until mail opens, then shows it', async () => {
    jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    setup({ ...base, obituaryText: 'Text' } as Session);
    expect(screen.queryByText(OPENED)).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: BUTTON }));
    expect(await screen.findByText(OPENED)).toBeTruthy();
  });

  it('shows the shared line, not the opened line, after the share sheet completes', async () => {
    jest.spyOn(Linking, 'openURL').mockRejectedValue(new Error('no mail'));
    jest.spyOn(Share, 'share').mockResolvedValue({ action: Share.sharedAction, activityType: undefined });
    setup({ ...base, obituaryText: 'Text' } as Session);
    fireEvent.press(screen.getByRole('button', { name: BUTTON }));
    expect(await screen.findByText(SHARED)).toBeTruthy();
    expect(screen.queryByText(OPENED)).toBeNull();
  });

  it('shows no line when the share sheet was dismissed', async () => {
    jest.spyOn(Linking, 'openURL').mockRejectedValue(new Error('no mail'));
    const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: Share.dismissedAction, activityType: undefined });
    setup({ ...base, obituaryText: 'Text' } as Session);
    fireEvent.press(screen.getByRole('button', { name: BUTTON }));
    await waitFor(() => expect(share).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByRole('button', { name: BUTTON }).props.accessibilityState).not.toMatchObject({ busy: true }));
    expect(screen.queryByText(OPENED)).toBeNull();
    expect(screen.queryByText(SHARED)).toBeNull();
    expect(screen.queryByText(/couldn't open email/)).toBeNull();
  });

  it('paste fills the link field from the clipboard', async () => {
    jest.mocked(Clipboard.getStringAsync).mockResolvedValue('  https://paper.example/anna  ');
    const onChange = jest.fn();
    setup(base, onChange);
    fireEvent.press(screen.getByRole('button', { name: 'Paste link' }));
    await waitFor(() => expect(onChange).toHaveBeenCalledWith({ obituaryUrl: 'https://paper.example/anna' }));
  });

  it('paste says "Link pasted." after a good link', async () => {
    jest.mocked(Clipboard.getStringAsync).mockResolvedValue('https://paper.example/anna');
    setup(base);
    fireEvent.press(screen.getByRole('button', { name: 'Paste link' }));
    expect(await screen.findByText('Link pasted.')).toBeTruthy();
  });

  it('paste leaves the field alone and says so when the clipboard is empty', async () => {
    jest.mocked(Clipboard.getStringAsync).mockResolvedValue('');
    const onChange = jest.fn();
    setup(base, onChange);
    fireEvent.press(screen.getByRole('button', { name: 'Paste link' }));
    expect(await screen.findByText("There's nothing to paste yet.")).toBeTruthy();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('paste leaves the field alone and says so when the clipboard is not a link', async () => {
    jest.mocked(Clipboard.getStringAsync).mockResolvedValue('see you at 3pm');
    const onChange = jest.fn();
    setup(base, onChange);
    fireEvent.press(screen.getByRole('button', { name: 'Paste link' }));
    expect(await screen.findByText(/doesn't look like a link/)).toBeTruthy();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('Copy the text puts the obituary on the clipboard', async () => {
    jest.mocked(Clipboard.setStringAsync).mockResolvedValue(true);
    setup({ ...base, obituaryText: 'Anna loved the garden.' } as Session);
    fireEvent.press(screen.getByRole('button', { name: 'Copy the text' }));
    await waitFor(() => expect(Clipboard.setStringAsync).toHaveBeenCalledWith('Anna loved the garden.'));
    expect(await screen.findByText('Copied.')).toBeTruthy();
  });

  it('says the copy failed when the phone refuses, and clears Copied when the email flow runs again', async () => {
    jest.mocked(Clipboard.setStringAsync).mockResolvedValueOnce(true).mockRejectedValueOnce(new Error('no'));
    jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    setup({ ...base, obituaryText: 'Text' } as Session);
    fireEvent.press(screen.getByRole('button', { name: 'Copy the text' }));
    expect(await screen.findByText('Copied.')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: BUTTON }));
    await screen.findByText(OPENED);
    expect(screen.queryByText('Copied.')).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: 'Copy the text' }));
    expect(await screen.findByText("We couldn't copy the text on this phone.")).toBeTruthy();
    expect(screen.queryByText('Copied.')).toBeNull();
  });

  it('when mail and sharing fail, the message stays calm, no opened line shows, and Copy the text is offered', async () => {
    jest.spyOn(Linking, 'openURL').mockRejectedValue(new Error('no mail'));
    jest.spyOn(Share, 'share').mockRejectedValue(new Error('no share'));
    setup({ ...base, obituaryText: 'Text' } as Session);
    // Copy the text is there before the press and after the failure.
    expect(screen.getByRole('button', { name: 'Copy the text' })).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: BUTTON }));
    expect(await screen.findByText(/couldn't open email or sharing/)).toBeTruthy();
    expect(screen.queryByText(OPENED)).toBeNull();
    expect(screen.queryByText(/web/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Copy the text' })).toBeTruthy();
  });

  it('marks the email button busy while mail is opening', async () => {
    let finish: () => void = () => undefined;
    jest.spyOn(Linking, 'openURL').mockImplementation(() => new Promise<void>((resolve) => { finish = resolve; }));
    setup({ ...base, obituaryText: 'Text' } as Session);
    fireEvent.press(screen.getByRole('button', { name: BUTTON }));
    expect(screen.getByRole('button', { name: BUTTON }).props.accessibilityState).toMatchObject({ busy: true });
    await waitFor(() => expect(Linking.openURL).toHaveBeenCalled());
    finish();
    await screen.findByText(OPENED);
  });
});

describe('ShareObituaryScreen with fields only (#700)', () => {
  const fieldsOnly = { ...base, personName: 'Anna Lee', obituaryCity: 'Tulsa', obituaryCareer: 'a nurse' } as Session;
  const draft = obituaryTextFor(fieldsOnly);

  it('has a draft to send', () => {
    expect(draft).toContain('Anna Lee');
    expect(draft).toContain('Tulsa');
  });

  it('emails the draft built from the fields', async () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    setup(fieldsOnly);
    fireEvent.press(screen.getByRole('button', { name: BUTTON }));
    await waitFor(() => expect(open).toHaveBeenCalledTimes(1));
    expect(decodeURIComponent(String(open.mock.calls[0][0])).replace(/\r\n/g, '\n')).toContain(draft);
  });

  it('copies the draft built from the fields', async () => {
    jest.mocked(Clipboard.setStringAsync).mockResolvedValue(true);
    setup(fieldsOnly);
    fireEvent.press(screen.getByRole('button', { name: 'Copy the text' }));
    await waitFor(() => expect(Clipboard.setStringAsync).toHaveBeenCalledWith(draft));
  });
});

describe('ShareObituaryScreen What you will need (#699)', () => {
  const checklistModal = () => {
    const modal = screen.UNSAFE_getAllByType(Modal).find((m) => m.props.testID === 'checklist-sheet');
    if (!modal) {
      throw new Error('No checklist sheet');
    }
    return modal;
  };

  it('opens the new checklist sheet only after a tap, not the old Gather-only sheet', () => {
    setup(base);
    expect(checklistModal().props.visible).toBe(false);
    fireEvent.press(screen.getByRole('button', { name: "What you'll need" }));
    expect(checklistModal().props.visible).toBe(true);
    const sheet = within(screen.getByTestId('checklist-sheet'));
    expect(sheet.getByText('Your ticks stay on this phone.')).toBeTruthy();
    expect(screen.queryByText('Not today. Just so none of it surprises you.')).toBeNull();
  });

  it('saves a tick through onSetItem', () => {
    const onSetItem = jest.fn();
    setup(base, jest.fn(), onSetItem);
    fireEvent.press(screen.getByRole('button', { name: "What you'll need" }));
    fireEvent.press(within(screen.getByTestId('checklist-sheet')).getByRole('button', { name: /^Right away/ }));
    fireEvent.press(within(screen.getByTestId('checklist-sheet')).getAllByRole('checkbox')[0]);
    expect(onSetItem).toHaveBeenCalledTimes(1);
    expect(onSetItem.mock.calls[0][0]).toBe(CHECKLIST_PHASES.find((phase) => phase.key === 'right-away')?.itemIds[0]);
    expect(onSetItem.mock.calls[0][1]).toBe('done');
  });

  it('on iOS focus returns to the button through onDismiss', () => {
    const focus = jest.spyOn(AccessibilityInfo, 'setAccessibilityFocus').mockImplementation(() => undefined);
    const original = Platform.OS;
    Platform.OS = 'ios';
    try {
      setup(base);
      fireEvent.press(screen.getByRole('button', { name: "What you'll need" }));
      focus.mockClear();
      fireEvent.press(within(screen.getByTestId('checklist-sheet')).getByRole('button', { name: 'Close' }));
      expect(focus).not.toHaveBeenCalled();
      act(() => checklistModal().props.onDismiss());
      expect(focus).toHaveBeenCalledTimes(1);
      expect(isChecklistButton(focusedNode(focus))).toBe(true);
    } finally {
      Platform.OS = original;
    }
  });

  it('on Android focus returns to the button when the sheet is closed', () => {
    jest.useFakeTimers();
    const focus = jest.spyOn(AccessibilityInfo, 'setAccessibilityFocus').mockImplementation(() => undefined);
    const original = Platform.OS;
    Platform.OS = 'android';
    try {
      setup(base);
      fireEvent.press(screen.getByRole('button', { name: "What you'll need" }));
      focus.mockClear();
      fireEvent.press(within(screen.getByTestId('checklist-sheet')).getByRole('button', { name: 'Close' }));
      act(() => {
        jest.runAllTimers();
      });
      expect(focus).toHaveBeenCalledTimes(1);
      expect(isChecklistButton(focusedNode(focus))).toBe(true);
    } finally {
      Platform.OS = original;
      jest.useRealTimers();
    }
  });
});

// A small stand-in for the app: it keeps the person, and a patch from the screen changes it (as updateSession does).
function Harness({ initial, onPatch, onBack = jest.fn(), onContinue = jest.fn() }: { initial: Session; onPatch: (patch: object) => void; onBack?: () => void; onContinue?: () => void }) {
  const [session, setSession] = useState(initial);
  return (
    <SerifReadyContext.Provider value>
      <ShareObituaryScreen
        session={session}
        onChange={(patch) => {
          onPatch(patch);
          setSession((s) => ({ ...s, ...patch }));
        }}
        onSetItem={jest.fn()}
        onBack={onBack}
        onContinue={onContinue}
        onEmailed={jest.fn()}
      />
    </SerifReadyContext.Provider>
  );
}

function setupLive(session: Session, extra: { onBack?: () => void; onContinue?: () => void } = {}) {
  const onPatch = jest.fn();
  render(<Harness initial={session} onPatch={onPatch} {...extra} />);
  return onPatch;
}

const EDIT = 'Edit the text';
const SAVE = 'Save the text';
const BOX = 'Obituary text';

describe('ShareObituaryScreen shows and edits the obituary text (#701)', () => {
  it('shows the saved text', () => {
    setup({ ...base, obituaryText: 'Anna loved the garden.' } as Session);
    expect(screen.getByText('Anna loved the garden.')).toBeTruthy();
    expect(screen.getByRole('button', { name: EDIT })).toBeTruthy();
  });

  it('shows the draft built from the details when nothing was edited', () => {
    const session = { ...base, obituaryCity: 'Boston', obituaryCareer: 'Teacher' } as Session;
    const draft = obituaryTextFor(session);
    expect(draft).not.toBe('');
    setup(session);
    expect(screen.getByText(draft)).toBeTruthy();
  });

  it('with no text, keeps the come-back line and offers to write it here', () => {
    setup(base);
    expect(screen.getByText("Write it above, or on the web.")).toBeTruthy();
    expect(screen.queryByRole('button', { name: EDIT })).toBeNull();
    expect(screen.getByRole('button', { name: 'Write the text' })).toBeTruthy();
  });

  it('edit, save: the full text is written to obituaryText and then shown', () => {
    const onPatch = setupLive({ ...base, obituaryText: 'Old text.' } as Session);
    fireEvent.press(screen.getByRole('button', { name: EDIT }));
    const box = screen.getByLabelText(BOX);
    expect(box.props.value).toBe('Old text.');
    expect(box.props.multiline).toBe(true);
    fireEvent.changeText(box, 'New text.\nSecond line.');
    fireEvent.press(screen.getByRole('button', { name: SAVE }));
    expect(onPatch).toHaveBeenCalledTimes(1);
    expect(onPatch).toHaveBeenCalledWith({ obituaryText: 'New text.\nSecond line.' });
    expect(screen.queryByLabelText(BOX)).toBeNull();
    expect(screen.getByText('New text.\nSecond line.')).toBeTruthy();
    expect(screen.getByText('Saved.')).toBeTruthy();
  });

  it('saving the draft unchanged writes nothing, so it keeps following the details', () => {
    const session = { ...base, obituaryCity: 'Boston' } as Session;
    const draft = obituaryTextFor(session);
    const onPatch = setupLive(session);
    fireEvent.press(screen.getByRole('button', { name: EDIT }));
    expect(screen.getByLabelText(BOX).props.value).toBe(draft);
    fireEvent.press(screen.getByRole('button', { name: SAVE }));
    expect(onPatch).not.toHaveBeenCalled();
    expect(screen.getByText(draft)).toBeTruthy();
  });

  it('changing the draft freezes it as the edited text', () => {
    const onPatch = setupLive({ ...base, obituaryCity: 'Boston' } as Session);
    fireEvent.press(screen.getByRole('button', { name: EDIT }));
    fireEvent.changeText(screen.getByLabelText(BOX), 'My own words.');
    fireEvent.press(screen.getByRole('button', { name: SAVE }));
    expect(onPatch).toHaveBeenCalledWith({ obituaryText: 'My own words.' });
  });

  it('clearing the box (or only spaces) sets obituaryText to undefined and says the text follows the details', () => {
    const session = { ...base, obituaryText: 'Old text.', obituaryCity: 'Boston' } as Session;
    const draft = obituaryTextFor({ ...session, obituaryText: undefined } as Session);
    const onPatch = setupLive(session);
    fireEvent.press(screen.getByRole('button', { name: EDIT }));
    fireEvent.changeText(screen.getByLabelText(BOX), '   ');
    fireEvent.press(screen.getByRole('button', { name: SAVE }));
    expect(onPatch).toHaveBeenCalledWith({ obituaryText: undefined });
    expect(screen.getByText('The text follows the details again.')).toBeTruthy();
    expect(screen.getByText(draft)).toBeTruthy();
  });

  it('the box has a hint, a 10000 character limit, and Save above it; Step 2 and Continue are hidden while editing', () => {
    setup({ ...base, obituaryText: 'Old text.' } as Session);
    fireEvent.press(screen.getByRole('button', { name: EDIT }));
    const box = screen.getByLabelText(BOX);
    expect(box.props.maxLength).toBe(10000);
    expect(box.props.accessibilityHint).toBe('Change anything you like.');
    const texts = JSON.stringify(screen.toJSON());
    expect(texts.indexOf('Save the text')).toBeLessThan(texts.indexOf('Obituary text'));
    expect(screen.queryByLabelText('Link to the obituary')).toBeNull();
    expect(screen.queryByRole('button', { name: /Choose who to send it to/ })).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByLabelText('Link to the obituary')).toBeTruthy();
  });

  it('header Back while editing saves the typed text first, then goes back', () => {
    const onBack = jest.fn();
    const onPatch = setupLive({ ...base, obituaryText: 'Old text.' } as Session, { onBack });
    fireEvent.press(screen.getByRole('button', { name: EDIT }));
    fireEvent.changeText(screen.getByLabelText(BOX), 'Typed words.');
    fireEvent.press(screen.getByRole('button', { name: 'Back' }));
    expect(onPatch).toHaveBeenCalledWith({ obituaryText: 'Typed words.' });
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  describe('Android Back while editing', () => {
    function captureBack() {
      let handler: () => boolean | null | undefined = () => false;
      jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_e, h) => {
        handler = h as () => boolean | null | undefined;
        return { remove: jest.fn() };
      });
      return () => handler();
    }

    it('with the keyboard closed, saves and leaves the screen', () => {
      const press = captureBack();
      jest.spyOn(Keyboard, 'isVisible').mockReturnValue(false);
      const onBack = jest.fn();
      const onPatch = setupLive({ ...base, obituaryText: 'Old text.' } as Session, { onBack });
      fireEvent.press(screen.getByRole('button', { name: EDIT }));
      fireEvent.changeText(screen.getByLabelText(BOX), 'Typed words.');
      let handled: boolean | null | undefined;
      act(() => {
        handled = press();
      });
      expect(handled).toBe(true);
      expect(onPatch).toHaveBeenCalledWith({ obituaryText: 'Typed words.' });
      expect(onBack).toHaveBeenCalledTimes(1);
    });

    it('with the keyboard open, only closes the keyboard', () => {
      const press = captureBack();
      jest.spyOn(Keyboard, 'isVisible').mockReturnValue(true);
      const dismiss = jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => undefined);
      const onBack = jest.fn();
      const onPatch = setupLive({ ...base, obituaryText: 'Old text.' } as Session, { onBack });
      fireEvent.press(screen.getByRole('button', { name: EDIT }));
      fireEvent.changeText(screen.getByLabelText(BOX), 'Typed words.');
      let handled: boolean | null | undefined;
      act(() => {
        handled = press();
      });
      expect(handled).toBe(true);
      expect(dismiss).toHaveBeenCalledTimes(1);
      expect(onBack).not.toHaveBeenCalled();
      expect(onPatch).not.toHaveBeenCalled();
      expect(screen.getByLabelText(BOX).props.value).toBe('Typed words.');
    });
  });

  it('saves the typed text when the screen goes away another way (a person switch)', () => {
    const onPatch = jest.fn();
    const view = render(
      <SerifReadyContext.Provider value>
        <ShareObituaryScreen session={{ ...base, obituaryText: 'Old text.' } as Session} onChange={onPatch} onSetItem={jest.fn()} onBack={jest.fn()} onContinue={jest.fn()} onEmailed={jest.fn()} />
      </SerifReadyContext.Provider>,
    );
    fireEvent.press(screen.getByRole('button', { name: EDIT }));
    fireEvent.changeText(screen.getByLabelText(BOX), 'Typed words.');
    view.unmount();
    expect(onPatch).toHaveBeenCalledWith({ obituaryText: 'Typed words.' });
  });

  it('on iOS, announces the saved line in the queue', () => {
    const original = Platform.OS;
    Platform.OS = 'ios';
    try {
      const say = jest.spyOn(AccessibilityInfo, 'announceForAccessibilityWithOptions').mockImplementation(() => undefined);
      setupLive({ ...base, obituaryText: 'Old text.' } as Session);
      fireEvent.press(screen.getByRole('button', { name: EDIT }));
      fireEvent.changeText(screen.getByLabelText(BOX), 'Changed');
      fireEvent.press(screen.getByRole('button', { name: SAVE }));
      expect(say).toHaveBeenCalledWith('Saved.', { queue: true });
    } finally {
      Platform.OS = original;
    }
  });

  it('uses height keyboard avoidance on Android', () => {
    const original = Platform.OS;
    Platform.OS = 'android';
    try {
      setup(base);
      expect(screen.UNSAFE_getByType(KeyboardAvoidingView).props.behavior).toBe('height');
    } finally {
      Platform.OS = original;
    }
  });

  it('writes from empty', () => {
    const onPatch = setupLive(base);
    fireEvent.press(screen.getByRole('button', { name: 'Write the text' }));
    fireEvent.changeText(screen.getByLabelText(BOX), 'Anna was kind.');
    fireEvent.press(screen.getByRole('button', { name: SAVE }));
    expect(onPatch).toHaveBeenCalledWith({ obituaryText: 'Anna was kind.' });
    expect(screen.getByRole('button', { name: BUTTON })).toBeTruthy();
  });

  it('Cancel keeps the old text and writes nothing', () => {
    const onPatch = setupLive({ ...base, obituaryText: 'Old text.' } as Session);
    fireEvent.press(screen.getByRole('button', { name: EDIT }));
    fireEvent.changeText(screen.getByLabelText(BOX), 'Typed then dropped.');
    fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));
    expect(onPatch).not.toHaveBeenCalled();
    expect(screen.getByText('Old text.')).toBeTruthy();
    expect(screen.queryByText('Typed then dropped.')).toBeNull();
    // A second edit starts from the saved text, not the dropped one.
    fireEvent.press(screen.getByRole('button', { name: EDIT }));
    expect(screen.getByLabelText(BOX).props.value).toBe('Old text.');
  });

  it('keeps typed text when the keyboard closes (the box loses focus)', () => {
    const onPatch = setupLive({ ...base, obituaryText: 'Old text.' } as Session);
    fireEvent.press(screen.getByRole('button', { name: EDIT }));
    const box = screen.getByLabelText(BOX);
    fireEvent.changeText(box, 'Half done');
    fireEvent(box, 'blur');
    expect(onPatch).not.toHaveBeenCalled();
    expect(screen.getByLabelText(BOX).props.value).toBe('Half done');
  });

  it('hides Email and Copy while editing, so they never send a stale text', () => {
    setup({ ...base, obituaryText: 'Old text.' } as Session);
    fireEvent.press(screen.getByRole('button', { name: EDIT }));
    expect(screen.queryByRole('button', { name: BUTTON })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Copy the text' })).toBeNull();
  });

  it('Email sends the edited text', async () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    setupLive({ ...base, obituaryText: 'Old text.' } as Session);
    fireEvent.press(screen.getByRole('button', { name: EDIT }));
    fireEvent.changeText(screen.getByLabelText(BOX), 'Edited text.');
    fireEvent.press(screen.getByRole('button', { name: SAVE }));
    fireEvent.press(screen.getByRole('button', { name: BUTTON }));
    await waitFor(() => expect(open).toHaveBeenCalledTimes(1));
    expect(decodeURIComponent(String(open.mock.calls[0][0]))).toBe('mailto:?subject=Obituary for Anna&body=Edited text.');
  });

  it('Copy copies the edited text', async () => {
    jest.mocked(Clipboard.setStringAsync).mockResolvedValue(true);
    setupLive({ ...base, obituaryText: 'Old text.' } as Session);
    fireEvent.press(screen.getByRole('button', { name: EDIT }));
    fireEvent.changeText(screen.getByLabelText(BOX), 'Edited text.');
    fireEvent.press(screen.getByRole('button', { name: SAVE }));
    fireEvent.press(screen.getByRole('button', { name: 'Copy the text' }));
    await waitFor(() => expect(Clipboard.setStringAsync).toHaveBeenCalledWith('Edited text.'));
  });

  it('puts screen-reader focus on the Edit button (its own node) after Save and after Cancel', () => {
    jest.useFakeTimers();
    try {
      const focus = jest.spyOn(AccessibilityInfo, 'setAccessibilityFocus').mockImplementation(() => undefined);
      jest.spyOn(Keyboard, 'isVisible').mockReturnValue(false);
      setupLive({ ...base, obituaryText: 'Old text.' } as Session);
      focus.mockClear();
      fireEvent.press(screen.getByRole('button', { name: EDIT }));
      fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));
      act(() => {
        jest.runAllTimers();
      });
      expect(focus).toHaveBeenCalledTimes(1);
      expect(isButton(focusedNode(focus), EDIT)).toBe(true);
      fireEvent.press(screen.getByRole('button', { name: EDIT }));
      fireEvent.changeText(screen.getByLabelText(BOX), 'Changed');
      fireEvent.press(screen.getByRole('button', { name: SAVE }));
      act(() => {
        jest.runAllTimers();
      });
      expect(focus).toHaveBeenCalledTimes(2);
      expect(isButton(focusedNode(focus), EDIT)).toBe(true);
    } finally {
      jest.useRealTimers();
    }
  });

  it('with the keyboard open, waits for keyboardDidHide before moving focus', () => {
    const focus = jest.spyOn(AccessibilityInfo, 'setAccessibilityFocus').mockImplementation(() => undefined);
    jest.spyOn(Keyboard, 'isVisible').mockReturnValue(true);
    let didHide: () => void = () => undefined;
    jest.spyOn(Keyboard, 'addListener').mockImplementation(((_e: string, h: () => void) => {
      didHide = h;
      return { remove: jest.fn() };
    }) as never);
    setupLive({ ...base, obituaryText: 'Old text.' } as Session);
    focus.mockClear();
    fireEvent.press(screen.getByRole('button', { name: EDIT }));
    fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));
    expect(focus).not.toHaveBeenCalled();
    act(() => {
      didHide();
    });
    expect(focus).toHaveBeenCalledTimes(1);
  });
});

describe("ShareObituaryScreen publisher's email", () => {
  const withText = { ...base, obituaryText: 'Anna loved the garden.' } as Session;
  const FIELD = "Publisher's email (optional)";

  it('puts a typed address in the mailto To, on this phone only', async () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    const onChange = jest.fn();
    setup(withText, onChange);
    fireEvent.changeText(screen.getByLabelText(FIELD), 'obits@paper.com');
    fireEvent.press(screen.getByRole('button', { name: BUTTON }));
    await waitFor(() => expect(open).toHaveBeenCalled());
    expect(open.mock.calls[0]?.[0]).toMatch(/^mailto:obits%40paper\.com\?subject=/);
    // Never handed to the session, so it can't sync (DS-7).
    expect(onChange).not.toHaveBeenCalled();
    await waitFor(async () => expect(await AsyncStorage.getItem(publisherEmailKey('a'))).toBe('obits@paper.com'));
  });

  it('refuses two addresses with calm copy and opens nothing', async () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    setup(withText);
    fireEvent.changeText(screen.getByLabelText(FIELD), 'a@b.com, c@d.com');
    fireEvent.press(screen.getByRole('button', { name: BUTTON }));
    expect(await screen.findByText('Please enter one email address only.')).toBeTruthy();
    expect(open).not.toHaveBeenCalled();
  });

  it('refuses a nonsense address when the field is left', async () => {
    setup(withText);
    fireEvent.changeText(screen.getByLabelText(FIELD), 'nonsense');
    fireEvent(screen.getByLabelText(FIELD), 'blur');
    expect(await screen.findByText("That email address doesn't look right. Check it and try again.")).toBeTruthy();
  });

  it('opens mail with no To when the field is empty', async () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    setup(withText);
    fireEvent.press(screen.getByRole('button', { name: BUTTON }));
    await waitFor(() => expect(open).toHaveBeenCalled());
    expect(open.mock.calls[0]?.[0]).toMatch(/^mailto:\?subject=/);
  });

  it('remembers the address for the same person and not for another', async () => {
    await AsyncStorage.setItem(publisherEmailKey('a'), 'obits@paper.com');
    await AsyncStorage.setItem(publisherEmailKey('b'), 'desk@other.com');
    setup(withText);
    expect(await screen.findByDisplayValue('obits@paper.com')).toBeTruthy();
    screen.unmount();
    setup({ ...withText, id: 'b' } as Session);
    expect(await screen.findByDisplayValue('desk@other.com')).toBeTruthy();
    expect(screen.queryByDisplayValue('obits@paper.com')).toBeNull();
  });

  it('shows nothing for a person with no saved address', async () => {
    await AsyncStorage.setItem(publisherEmailKey('a'), 'obits@paper.com');
    setup({ ...withText, id: 'c' } as Session);
    await waitFor(() => expect(screen.getByLabelText(FIELD).props.value).toBe(''));
  });

  it('is announced and focused on every refused press, not only the first', async () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => undefined);
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    jest.useFakeTimers();
    try {
      setup(withText);
      fireEvent.changeText(screen.getByLabelText(FIELD), 'nonsense');
      const press = () => fireEvent.press(screen.getByRole('button', { name: BUTTON }));
      const message = "That email address doesn't look right. Check it and try again.";
      const heard = () => announce.mock.calls.filter(([text]) => text === message).length;
      press();
      const afterFirst = heard();
      expect(afterFirst).toBeGreaterThan(0);
      // The error is already on screen, so only our own announcement can make the second press heard.
      press();
      expect(heard()).toBe(afterFirst + 1);
      act(() => {
        jest.runOnlyPendingTimers();
      });
      // The Email button carries the reason as its hint while the address is wrong.
      expect(screen.getByRole('button', { name: BUTTON }).props.accessibilityHint).toBe(message);
      expect(open).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  it('shows the error on leaving the field, and hides it again while typing', async () => {
    setup(withText);
    const field = screen.getByLabelText(FIELD);
    fireEvent.changeText(field, 'nonsense');
    expect(screen.queryByText(/doesn't look right/)).toBeNull();
    fireEvent(field, 'blur');
    expect(await screen.findByText(/doesn't look right/)).toBeTruthy();
    fireEvent.changeText(field, 'nonsens');
    expect(screen.queryByText(/doesn't look right/)).toBeNull();
  });

  it('keeps the phone from offering the user\'s own email', () => {
    setup(withText);
    const field = screen.getByLabelText(FIELD);
    expect(field.props.autoComplete).toBe('off');
    expect(field.props.textContentType).toBe('none');
    expect(field.props.accessibilityHint).toBe('Kept on this phone only.');
  });

  it('opens the in-app composer with the typed address as the only recipient', async () => {
    (MailComposer.isAvailableAsync as jest.Mock<() => Promise<boolean>>).mockResolvedValueOnce(true);
    (MailComposer.composeAsync as jest.Mock<() => Promise<{ status: string }>>).mockResolvedValueOnce({ status: 'sent' });
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    setup(withText);
    fireEvent.changeText(screen.getByLabelText(FIELD), 'obits@paper.com');
    fireEvent.press(screen.getByRole('button', { name: BUTTON }));
    await screen.findByText(OPENED);
    expect(MailComposer.composeAsync).toHaveBeenCalledWith({ recipients: ['obits@paper.com'], subject: expect.any(String), body: 'Anna loved the garden.' });
    expect(open).not.toHaveBeenCalled();
  });
});

describe('ShareObituaryScreen Done after emailing (#726)', () => {
  it('says to tap Done after mail opened, in the polite live line', async () => {
    jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    setup({ ...base, obituaryText: 'Anna loved the garden.' } as Session);
    fireEvent.press(screen.getByRole('button', { name: BUTTON }));
    const note = await screen.findByText('Opened in your email app. Tap Done when you have sent it.');
    expect(note.props.accessibilityLiveRegion ?? note.parent?.props.accessibilityLiveRegion).toBe('polite');
  });

  it('drops the bar bottom inset while the keyboard is open', async () => {
    jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    const handlers: Record<string, () => void> = {};
    jest.spyOn(Keyboard, 'addListener').mockImplementation(((event: string, h: () => void) => {
      handlers[event] = h;
      return { remove: jest.fn() };
    }) as unknown as typeof Keyboard.addListener);
    (useSafeAreaInsets as jest.Mock).mockReturnValue({ top: 0, left: 0, right: 0, bottom: 34 });
    setup({ ...base, obituaryText: 'Anna loved the garden.' } as Session);
    fireEvent.press(screen.getByRole('button', { name: BUTTON }));
    await screen.findByRole('button', { name: 'Done' });
    expect(screen.getByTestId('obituary-done-wrap').props.style).toBeUndefined();
    act(() => (handlers.keyboardWillShow ?? handlers.keyboardDidShow)?.());
    expect(StyleSheet.flatten(screen.getByTestId('obituary-done-wrap').props.style)).toEqual({ marginBottom: -34 });
    act(() => (handlers.keyboardWillHide ?? handlers.keyboardDidHide)?.());
    expect(screen.getByTestId('obituary-done-wrap').props.style).toBeUndefined();
    (useSafeAreaInsets as jest.Mock).mockReturnValue({ top: 0, left: 0, right: 0, bottom: 0 });
  });

  const withText = { ...base, obituaryText: 'Anna loved the garden.' } as Session;
  const DONE = { name: 'Done' };

  it('shows no Done on arrival', () => {
    setup(withText);
    expect(screen.queryByRole('button', DONE)).toBeNull();
  });

  it('shows Done after mail opened, and a tap calls onEmailed once', async () => {
    jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    const onEmailed = jest.fn();
    setup(withText, jest.fn(), jest.fn(), onEmailed);
    fireEvent.press(screen.getByRole('button', { name: BUTTON }));
    await screen.findByText(OPENED);
    fireEvent.press(screen.getByRole('button', DONE));
    expect(onEmailed).toHaveBeenCalledTimes(1);
  });

  it('shows Done after the share sheet completed', async () => {
    jest.spyOn(Linking, 'openURL').mockRejectedValue(new Error('no mail'));
    jest.spyOn(Share, 'share').mockResolvedValue({ action: Share.sharedAction, activityType: undefined });
    setup(withText);
    fireEvent.press(screen.getByRole('button', { name: BUTTON }));
    await screen.findByText(SHARED);
    expect(screen.getByRole('button', DONE)).toBeTruthy();
  });

  it('leaving by Back before Done and coming back shows no Done', async () => {
    jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    setup(withText);
    fireEvent.press(screen.getByRole('button', { name: BUTTON }));
    await screen.findByRole('button', DONE);
    fireEvent.press(screen.getByRole('button', { name: 'Back' }));
    screen.unmount();
    setup(withText);
    expect(screen.queryByRole('button', DONE)).toBeNull();
  });

  it('shows no Done when the share sheet was dismissed', async () => {
    jest.spyOn(Linking, 'openURL').mockRejectedValue(new Error('no mail'));
    const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: Share.dismissedAction, activityType: undefined });
    setup(withText);
    fireEvent.press(screen.getByRole('button', { name: BUTTON }));
    await waitFor(() => expect(share).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByRole('button', { name: BUTTON }).props.accessibilityState).not.toMatchObject({ busy: true }));
    expect(screen.queryByRole('button', DONE)).toBeNull();
  });

  it('shows no Done when mail and sharing both fail', async () => {
    jest.spyOn(Linking, 'openURL').mockRejectedValue(new Error('no mail'));
    jest.spyOn(Share, 'share').mockRejectedValue(new Error('no share'));
    setup(withText);
    fireEvent.press(screen.getByRole('button', { name: BUTTON }));
    await screen.findByText(/couldn't open email or sharing/);
    expect(screen.queryByRole('button', DONE)).toBeNull();
  });

  it('hides Done while the text is being edited and shows it again after Save', async () => {
    jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    setup(withText);
    fireEvent.press(screen.getByRole('button', { name: BUTTON }));
    await screen.findByText(OPENED);
    fireEvent.press(screen.getByRole('button', { name: 'Edit the text' }));
    expect(screen.queryByRole('button', DONE)).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: 'Save the text' }));
    expect(screen.getByRole('button', DONE)).toBeTruthy();
  });
});

describe('ShareObituaryScreen with a memorial (#781)', () => {
  const memorial = 'In lieu of flowers, please give to the library.';
  const withMemorial = { ...base, obituaryText: 'Anna loved the garden.', obituaryMemorial: memorial } as Session;
  const full = `Anna loved the garden.\n\n${memorial}`;

  it('shows the full text, with the memorial last', () => {
    setup(withMemorial);
    expect(screen.getByText(full)).toBeTruthy();
  });

  it('Email puts the memorial in the body', async () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    setup(withMemorial);
    fireEvent.press(screen.getByRole('button', { name: BUTTON }));
    await waitFor(() => expect(open).toHaveBeenCalledTimes(1));
    expect(open).toHaveBeenCalledWith(expect.stringContaining('Anna%20loved%20the%20garden.%0D%0A%0D%0AIn%20lieu%20of%20flowers'));
  });

  it('Copy puts the memorial on the clipboard', async () => {
    jest.mocked(Clipboard.setStringAsync).mockResolvedValue(true);
    setup(withMemorial);
    fireEvent.press(screen.getByRole('button', { name: 'Copy the text' }));
    await waitFor(() => expect(Clipboard.setStringAsync).toHaveBeenCalledWith(full));
  });

  it('the share sheet gets the memorial too', async () => {
    jest.spyOn(Linking, 'openURL').mockRejectedValue(new Error('no mail'));
    const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' } as never);
    setup(withMemorial);
    fireEvent.press(screen.getByRole('button', { name: BUTTON }));
    await waitFor(() => expect(share).toHaveBeenCalled());
    expect(JSON.stringify(share.mock.calls[0])).toContain(memorial);
  });

  it('editing holds the body only, and saving never writes the memorial', () => {
    const onPatch = setupLive(withMemorial);
    fireEvent.press(screen.getByRole('button', { name: EDIT }));
    const box = screen.getByLabelText(BOX);
    expect(box.props.value).toBe('Anna loved the garden.');
    fireEvent.changeText(box, 'Anna loved her roses.');
    fireEvent.press(screen.getByRole('button', { name: SAVE }));
    expect(onPatch).toHaveBeenCalledTimes(1);
    expect(onPatch).toHaveBeenCalledWith({ obituaryText: 'Anna loved her roses.' });
    expect(screen.getByText(`Anna loved her roses.\n\n${memorial}`)).toBeTruthy();
  });

  it('saving the body unchanged writes nothing even with a memorial', () => {
    const onPatch = setupLive(withMemorial);
    fireEvent.press(screen.getByRole('button', { name: EDIT }));
    fireEvent.press(screen.getByRole('button', { name: SAVE }));
    expect(onPatch).not.toHaveBeenCalled();
  });

  it('shows the blanks line for a memorial placeholder, and keeps the buttons enabled', () => {
    setup({ ...withMemorial, obituaryMemorial: 'Gifts may go to the library. [FINAL WORDS]' } as Session);
    expect(screen.getByText('Some parts are still in [brackets]. Fill them in or delete them before you send.')).toBeTruthy();
    expect(screen.getByRole('button', { name: BUTTON }).props.accessibilityState?.disabled).toBeFalsy();
    expect(screen.getByRole('button', { name: 'Copy the text' }).props.accessibilityState?.disabled).toBeFalsy();
  });
});
