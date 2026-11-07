import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { useState } from 'react';
import { AccessibilityInfo, Linking, Modal, Platform, Share } from 'react-native';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import type { Session } from '@griever/hooks';
import { SerifReadyContext } from '../ui';
import * as Clipboard from 'expo-clipboard';
import { ShareObituaryScreen } from './ShareObituaryScreen';
import { obituaryTextFor } from '../lib/obituaryText';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { publisherEmailKey } from '../lib/mailCompose';

jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(), getStringAsync: jest.fn() }));

jest.mock('react-native/Libraries/ReactNative/RendererProxy', () => ({
  ...jest.requireActual<object>('react-native/Libraries/ReactNative/RendererProxy'),
  findNodeHandle: () => 1,
}));

const base = {
  id: 'a', flowId: 'flow-a', ownerId: null, role: 'owner', personName: 'Anna', dateOfPassing: '', senderName: '', obituaryUrl: '',
  createdAt: '2026-10-01T00:00:00.000Z', lastOpenedAt: '2026-10-01T00:00:00.000Z',
  drafts: {}, serviceReady: false, recipientsNotified: {}, momentCompletedAt: {}, remindersScheduled: [],
} as unknown as Session;

const BUTTON = 'Email it to the paper or funeral home';
const OPENED = "Opened in your email app. Come back when it's published.";
const SHARED = "Shared from your phone. Come back when it's published.";

function setup(session: Session, onChange = jest.fn(), onSetItem = jest.fn()) {
  render(
    <SerifReadyContext.Provider value>
      <ShareObituaryScreen session={session} onChange={onChange} onSetItem={onSetItem} onBack={jest.fn()} onContinue={jest.fn()} />
    </SerifReadyContext.Provider>,
  );
}

// React Native's jest setup already mocks Linking, so spies keep their calls between tests unless cleared.
beforeEach(() => {
  jest.clearAllMocks();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('ShareObituaryScreen step 1 (email the publisher)', () => {
  it('shows the button only when there is obituary text', () => {
    setup({ ...base, obituaryText: 'Anna loved the garden.' } as Session);
    expect(screen.getByRole('button', { name: BUTTON })).toBeTruthy();
  });

  it('with no text, says it can be written on the web and still lets the user continue to the link field', () => {
    setup(base);
    expect(screen.queryByRole('button', { name: BUTTON })).toBeNull();
    expect(screen.getByText("Once it's written, come back here.")).toBeTruthy();
    expect(screen.queryByText(/the web/)).toBeNull();
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
    } finally {
      Platform.OS = original;
      jest.useRealTimers();
    }
  });
});

// A small stand-in for the app: it keeps the person, and a patch from the screen changes it (as updateSession does).
function Harness({ initial, onPatch }: { initial: Session; onPatch: (patch: object) => void }) {
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
        onBack={jest.fn()}
        onContinue={jest.fn()}
      />
    </SerifReadyContext.Provider>
  );
}

function setupLive(session: Session) {
  const onPatch = jest.fn();
  render(<Harness initial={session} onPatch={onPatch} />);
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
    expect(screen.getByText("Once it's written, come back here.")).toBeTruthy();
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
    expect(screen.getByText('Saved on this phone.')).toBeTruthy();
  });

  it('saving the draft built from the details freezes it as the edited text', () => {
    const session = { ...base, obituaryCity: 'Boston' } as Session;
    const draft = obituaryTextFor(session);
    const onPatch = setupLive(session);
    fireEvent.press(screen.getByRole('button', { name: EDIT }));
    expect(screen.getByLabelText(BOX).props.value).toBe(draft);
    fireEvent.press(screen.getByRole('button', { name: SAVE }));
    expect(onPatch).toHaveBeenCalledWith({ obituaryText: draft });
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

  it('puts screen-reader focus on the Edit button after Save and after Cancel', () => {
    const focus = jest.spyOn(AccessibilityInfo, 'setAccessibilityFocus').mockImplementation(() => undefined);
    setupLive({ ...base, obituaryText: 'Old text.' } as Session);
    focus.mockClear();
    fireEvent.press(screen.getByRole('button', { name: EDIT }));
    fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));
    expect(focus).toHaveBeenCalledTimes(1);
    fireEvent.press(screen.getByRole('button', { name: EDIT }));
    fireEvent.press(screen.getByRole('button', { name: SAVE }));
    expect(focus).toHaveBeenCalledTimes(2);
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
    setup(withText);
    expect(await screen.findByDisplayValue('obits@paper.com')).toBeTruthy();
    screen.unmount();
    setup({ ...withText, id: 'b' } as Session);
    await waitFor(() => expect(screen.getByLabelText(FIELD).props.value).toBe(''));
  });
});
