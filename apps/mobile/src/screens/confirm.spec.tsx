import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { useEffect } from 'react';
import { AccessibilityInfo, Linking, Share } from 'react-native';
import { StyleSheet } from 'react-native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { freshDraft, useSendFlow } from '@griever/hooks';
import { SHARE_SERVICE_SAMPLE } from '@griever/shared';
import type { SessionDetails } from '@griever/shared';
import { ConfirmScreen } from './ConfirmScreen';
import { SendingScreen } from './SendingScreen';

const session = { personName: 'Margaret Hayes', dateOfPassing: '', senderName: 'Peter', obituaryUrl: '', obituaryPublisher: '', serviceDate: '' } as SessionDetails;
const contacts = { contacts: [{ contactId: 'c0', name: 'Dee', phone: '+15555550100' }] } as never;

// Stable defaults: a new array each render would re-run the effect below.
const PICKED = ['c0'];
const NONE: string[] = [];

function Harness({ fields, thanks, senderName, category, ids = PICKED }: { fields?: Record<string, string>; thanks?: boolean; senderName?: string; category?: 'announcement' | 'obituary'; ids?: string[] } = {}) {
  const flow = useSendFlow({
    session: { ...session, ...(senderName === undefined ? {} : { senderName }) },
    draft: freshDraft({
      templateCategory: category ?? (thanks ? 'aftercare' : 'service'),
      templateOverrideId: category ? undefined : thanks ? 'thank-you-note' : 'share-service',
      step: 'review',
      fields: fields ?? { serviceDate: 'June 14', serviceTime: '2:00 PM', serviceLocation: 'Oak Chapel' },
    }),
  });
  const { selectContacts } = flow;
  useEffect(() => { selectContacts(ids); }, [selectContacts, ids]);
  return flow.sendJob ? <SendingScreen flow={flow} contacts={contacts} /> : <ConfirmScreen flow={flow} contacts={contacts} />;
}

describe('Review your message (Share the service)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('sends the edited text in the sms: link', async () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    render(<Harness />);
    fireEvent.changeText(screen.getByLabelText('Your message'), 'Come as you are, 2 PM at Oak Chapel.');
    fireEvent.press(screen.getByText('Text these people'));
    fireEvent.press(await screen.findByText('Text Dee'));
    expect(decodeURIComponent(String(open.mock.calls[0][0]))).toContain('body=Dee,\nCome as you are, 2 PM at Oak Chapel.');
  });

  it('shows the same text it hands to Messages', async () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    open.mockClear();
    render(<Harness />);
    fireEvent.changeText(screen.getByLabelText('Your message'), 'Come as you are.');
    fireEvent.press(screen.getByText('Text these people'));
    fireEvent.press(await screen.findByText('Text Dee'));
    const body = decodeURIComponent(String(open.mock.calls[0][0])).split('body=')[1];
    expect(body).toBe('Dee,\nCome as you are.');
    expect(screen.getByText(body)).toBeTruthy();
  });

  it('sends the plain message with the switch off', async () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    open.mockClear();
    render(<Harness />);
    fireEvent.changeText(screen.getByLabelText('Your message'), 'Come as you are.');
    fireEvent.press(screen.getByRole('switch', { name: 'Start with their first name' }));
    fireEvent.press(screen.getByText('Text these people'));
    fireEvent.press(await screen.findByText('Text Dee'));
    const body = decodeURIComponent(String(open.mock.calls[0][0])).split('body=')[1];
    expect(body).toBe('Come as you are.');
  });

  it('has a switch with an accessible name and state, and previews the greeting', () => {
    render(<Harness />);
    const toggle = screen.getByRole('switch', { name: 'Start with their first name' });
    expect(toggle.props.accessibilityState).toEqual({ checked: true });
    expect(screen.getByText('For example: Dee,')).toBeTruthy();
    fireEvent.press(toggle);
    expect(screen.getByRole('switch', { name: 'Start with their first name' }).props.accessibilityState).toEqual({ checked: false });
    expect(screen.queryByText(/For example/)).toBeNull();
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibilityWithOptions').mockImplementation(() => undefined);
    fireEvent.press(screen.getByRole('switch', { name: 'Start with their first name' }));
    expect(announce).toHaveBeenCalledWith('For example: Dee,', { queue: true });
  });

  it('opens and closes the sample with accessibilityState.expanded and a 44 point target', () => {
    render(<Harness />);
    const toggle = screen.getByRole('button', { name: 'Sample message' });
    expect(toggle.props.accessibilityState).toEqual({ expanded: false });
    const style = StyleSheet.flatten(toggle.props.style);
    expect(style.minHeight).toBeGreaterThanOrEqual(44);
    expect(style.minWidth).toBeGreaterThanOrEqual(44);
    expect(screen.queryByText(SHARE_SERVICE_SAMPLE)).toBeNull();
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => undefined);
    fireEvent.press(toggle);
    expect(announce).toHaveBeenCalledWith(SHARE_SERVICE_SAMPLE);
    expect(screen.getByRole('button', { name: 'Sample message' }).props.accessibilityState).toEqual({ expanded: true });
    expect(screen.getByText(SHARE_SERVICE_SAMPLE)).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Sample message' }));
    expect(screen.getByRole('button', { name: 'Sample message' }).props.accessibilityState).toEqual({ expanded: false });
    expect(screen.queryByText(SHARE_SERVICE_SAMPLE)).toBeNull();
  });

  it('blocks sending a blank message and says why', () => {
    render(<Harness />);
    fireEvent.changeText(screen.getByLabelText('Your message'), '   ');
    expect(screen.getByText('Add a message before you send it.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Text these people' }).props.accessibilityState?.disabled).toBe(true);
    expect(screen.getByLabelText('Your message').props.value).toBe('   ');
  });

  describe('Details row', () => {
    it('changes the preview when the date changes', () => {
      render(<Harness />);
      expect(screen.getByLabelText('Service date').props.value).toBe('June 14');
      fireEvent.changeText(screen.getByLabelText('Service date'), 'June 20');
      expect(screen.getByLabelText('Your message').props.value).toContain('June 20');
      expect(screen.getByLabelText('Your message').props.value).not.toContain('June 14');
    });

    it('blocks Send and says why while a required field is empty', () => {
      render(<Harness fields={{ serviceDate: 'June 14', serviceTime: '2:00 PM', serviceLocation: '' }} />);
      expect(screen.getByLabelText('Location, Needed')).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Text these people' }).props.accessibilityState?.disabled).toBe(true);
      // Send and Share elsewhere each carry the reason, so each button points at its own line.
      expect(screen.getAllByText('Fill in the empty details to send.')).toHaveLength(2);
      fireEvent.changeText(screen.getByLabelText('Location, Needed'), 'Oak Chapel');
      expect(screen.queryByLabelText(/Needed/)).toBeNull();
      expect(screen.getByRole('button', { name: 'Text these people' }).props.accessibilityState?.disabled).toBeFalsy();
    });

    it('hides the inputs for hand-edited text, and Use the suggested wording brings them back', () => {
      render(<Harness />);
      fireEvent.changeText(screen.getByLabelText('Your message'), 'My own words.');
      expect(screen.queryByLabelText('Service date')).toBeNull();
      expect(screen.getByLabelText('Your message').props.value).toBe('My own words.');
      fireEvent.press(screen.getByText('Use the suggested wording'));
      expect(screen.getByLabelText('Service date')).toBeTruthy();
      expect(screen.getByLabelText('Your message').props.value).toContain('June 14');
    });
  });

  describe('Details row (Thank-you note)', () => {
    it('asks for the sender when setup has no name, and blocks Send', () => {
      render(<Harness thanks senderName="" fields={{}} />);
      expect(screen.getByLabelText('Your name or family name, Needed')).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Text these people' }).props.accessibilityState?.disabled).toBe(true);
    });

    it('shows only the personal note when setup has the name, and the preview follows typing', () => {
      render(<Harness thanks senderName="The Hayes Family" fields={{}} />);
      expect(screen.queryByLabelText(/Your name or family name/)).toBeNull();
      expect(screen.queryByLabelText(/Full name of the deceased/)).toBeNull();
      expect(screen.getByRole('button', { name: 'Text these people' }).props.accessibilityState?.disabled).toBeFalsy();
      fireEvent.changeText(screen.getByLabelText('Personal note (optional)'), 'Your flowers meant a lot.');
      expect(screen.getByText(/Your flowers meant a lot\./)).toBeTruthy();
    });
  });
});

describe('Share elsewhere', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  const shared = { action: Share.sharedAction, activityType: undefined };
  const shareButton = () => screen.getByRole('button', { name: 'Share elsewhere' });

  it('shows on the service after Send, and shares the message without a greeting', async () => {
    const share = jest.spyOn(Share, 'share').mockResolvedValue(shared);
    render(<Harness />);
    expect(screen.getByText('Text these people')).toBeTruthy();
    fireEvent.changeText(screen.getByLabelText('Your message'), 'Come as you are.');
    fireEvent.press(shareButton());
    await waitFor(() => expect(share).toHaveBeenCalledWith({ message: 'Come as you are.' }));
  });

  it('puts Send and its privacy line before Share elsewhere when people are picked', () => {
    render(<Harness />);
    const tree = JSON.stringify(screen.toJSON());
    expect(tree.indexOf('Text these people')).toBeLessThan(tree.indexOf('Share elsewhere'));
    expect(tree.indexOf("You'll text each person")).toBeLessThan(tree.indexOf('Share elsewhere'));
  });

  it('with no one picked is the only action, and records nothing', async () => {
    const share = jest.spyOn(Share, 'share').mockResolvedValue(shared);
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    open.mockClear();
    render(<Harness ids={NONE} />);
    expect(screen.queryByText('Text these people')).toBeNull();
    expect(screen.queryByText(/^Text /)).toBeNull();
    expect(screen.queryByRole('switch')).toBeNull();
    fireEvent.press(shareButton());
    await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
    expect(open).not.toHaveBeenCalled();
    expect(screen.queryByText(/Sending|sent/i)).toBeNull();
  });

  it('is disabled with a share-specific hint when the message is blank', () => {
    const share = jest.spyOn(Share, 'share').mockResolvedValue(shared);
    render(<Harness ids={NONE} />);
    fireEvent.changeText(screen.getByLabelText('Your message'), '   ');
    expect(shareButton().props.accessibilityState?.disabled).toBe(true);
    expect(shareButton().props.accessibilityHint).toBe('Add a message before you share it.');
    expect(screen.getByText('Add a message before you share it.')).toBeTruthy();
    expect(screen.queryByText(/send/i)).toBeNull();
    fireEvent.press(shareButton());
    expect(share).not.toHaveBeenCalled();
  });

  it('shows the calm error in a status line, announces it, and clears it when the message changes', async () => {
    jest.spyOn(Share, 'share').mockRejectedValue(new Error('no'));
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => undefined);
    render(<Harness ids={NONE} />);
    fireEvent.press(shareButton());
    const line = await screen.findByText("That didn't go through. You can try again.");
    expect(line.props.role).toBe('status');
    expect(line.props.accessibilityLiveRegion).toBe('polite');
    expect(announce).toHaveBeenCalledWith("That didn't go through. You can try again.");
    fireEvent.changeText(screen.getByLabelText('Your message'), 'A new line.');
    expect(screen.queryByText("That didn't go through. You can try again.")).toBeNull();
  });

  it('shows on the obituary', () => {
    render(<Harness category="obituary" ids={NONE} />);
    expect(shareButton()).toBeTruthy();
  });

  it('is not on the announcement or the thank-you, and Send is', () => {
    const { unmount } = render(<Harness category="announcement" />);
    expect(screen.queryByText('Share elsewhere')).toBeNull();
    expect(screen.getByText('Text 1 person')).toBeTruthy();
    unmount();
    render(<Harness thanks senderName="The Hayes Family" fields={{}} />);
    expect(screen.queryByText('Share elsewhere')).toBeNull();
    expect(screen.getByText('Text these people')).toBeTruthy();
  });
});
