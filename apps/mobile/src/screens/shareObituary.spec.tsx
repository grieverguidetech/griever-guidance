import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Linking, Share } from 'react-native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { Session } from '@griever/hooks';
import { SerifReadyContext } from '@griever/ui';
import * as Clipboard from 'expo-clipboard';
import { ShareObituaryScreen } from './ShareObituaryScreen';

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

function setup(session: Session, onChange = jest.fn()) {
  render(
    <SerifReadyContext.Provider value>
      <ShareObituaryScreen session={session} onChange={onChange} onBack={jest.fn()} onContinue={jest.fn()} />
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
    expect(screen.getByText(/can write it on the web/)).toBeTruthy();
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
    expect(open).toHaveBeenCalledTimes(1);
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

  it('shows the opened line after the share sheet opens', async () => {
    jest.spyOn(Linking, 'openURL').mockRejectedValue(new Error('no mail'));
    jest.spyOn(Share, 'share').mockResolvedValue({ action: Share.sharedAction, activityType: undefined });
    setup({ ...base, obituaryText: 'Text' } as Session);
    fireEvent.press(screen.getByRole('button', { name: BUTTON }));
    expect(await screen.findByText(OPENED)).toBeTruthy();
  });

  it('paste fills the link field from the clipboard', async () => {
    jest.mocked(Clipboard.getStringAsync).mockResolvedValue('  https://paper.example/anna  ');
    const onChange = jest.fn();
    setup(base, onChange);
    fireEvent.press(screen.getByRole('button', { name: 'Paste link' }));
    await waitFor(() => expect(onChange).toHaveBeenCalledWith({ obituaryUrl: 'https://paper.example/anna' }));
  });

  it('paste leaves the field alone when the clipboard is empty', async () => {
    jest.mocked(Clipboard.getStringAsync).mockResolvedValue('');
    const onChange = jest.fn();
    setup(base, onChange);
    fireEvent.press(screen.getByRole('button', { name: 'Paste link' }));
    await waitFor(() => expect(Clipboard.getStringAsync).toHaveBeenCalled());
    expect(onChange).not.toHaveBeenCalled();
  });

  it('Copy the text puts the obituary on the clipboard', async () => {
    jest.mocked(Clipboard.setStringAsync).mockResolvedValue(true);
    setup({ ...base, obituaryText: 'Anna loved the garden.' } as Session);
    fireEvent.press(screen.getByRole('button', { name: 'Copy the text' }));
    await waitFor(() => expect(Clipboard.setStringAsync).toHaveBeenCalledWith('Anna loved the garden.'));
    expect(await screen.findByText('Copied.')).toBeTruthy();
  });

  it('when mail and sharing fail, the message stays calm, no opened line shows, and Copy the text is offered', async () => {
    jest.spyOn(Linking, 'openURL').mockRejectedValue(new Error('no mail'));
    jest.spyOn(Share, 'share').mockRejectedValue(new Error('no share'));
    setup({ ...base, obituaryText: 'Text' } as Session);
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
    finish();
    await screen.findByText(OPENED);
  });
});
