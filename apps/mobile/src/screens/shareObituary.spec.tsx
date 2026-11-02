import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { Linking, Share } from 'react-native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { Session } from '@griever/hooks';
import { SerifReadyContext } from '@griever/ui';
import { ShareObituaryScreen } from './ShareObituaryScreen';

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

function setup(session: Session) {
  render(
    <SerifReadyContext.Provider value>
      <ShareObituaryScreen session={session} onChange={jest.fn()} onBack={jest.fn()} onContinue={jest.fn()} />
    </SerifReadyContext.Provider>,
  );
}

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

  it('opens the share sheet with the same text when mail cannot open', async () => {
    jest.spyOn(Linking, 'openURL').mockRejectedValue(new Error('no mail'));
    const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: Share.sharedAction, activityType: undefined });
    setup({ ...base, obituaryText: 'Anna loved the garden.' } as Session);
    fireEvent.press(screen.getByRole('button', { name: BUTTON }));
    await waitFor(() => expect(share).toHaveBeenCalledWith({ message: 'Anna loved the garden.', title: 'Obituary for Anna' }));
  });

  it('says so calmly when mail and sharing both fail', async () => {
    jest.spyOn(Linking, 'openURL').mockRejectedValue(new Error('no mail'));
    jest.spyOn(Share, 'share').mockRejectedValue(new Error('no share'));
    setup({ ...base, obituaryText: 'Anna loved the garden.' } as Session);
    fireEvent.press(screen.getByRole('button', { name: BUTTON }));
    expect(await screen.findByText(/couldn't open email or sharing/)).toBeTruthy();
  });
});
