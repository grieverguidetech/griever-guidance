import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { useEffect } from 'react';
import { AccessibilityInfo, Linking, Share } from 'react-native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { freshDraft, useSendFlow } from '@griever/hooks';
import type { SessionDetails } from '@griever/shared';
import { ReadyToSendScreen } from './ReadyToSendScreen';
import { SendingScreen } from './SendingScreen';

const session = { personName: 'Margaret Hayes', dateOfPassing: '', senderName: 'Peter', obituaryUrl: '', obituaryPublisher: '', serviceDate: '' } as SessionDetails;
const contacts = {
  contacts: [
    { contactId: 'c0', name: 'Dee', phone: '+15555550100' },
    { contactId: 'c1', name: 'Ana Lopez', phone: '+15555550101' },
    { contactId: 'c2', name: 'Ben', phone: '+15555550102' },
    { contactId: 'c3', name: 'Cal', phone: '+15555550103' },
    { contactId: 'c4', name: 'Eve', phone: '+15555550104' },
  ],
} as never;

// Stable defaults: a new array each render would re-run the effect below.
const PICKED = ['c0'];
const NONE: string[] = [];
const FIVE = ['c0', 'c1', 'c2', 'c3', 'c4'];
const TWO = ['c0', 'c1'];

function Harness({ fields, thanks, senderName, category, ids = PICKED, onChoose = () => undefined }: { fields?: Record<string, string>; thanks?: boolean; senderName?: string; category?: 'announcement' | 'obituary'; ids?: string[]; onChoose?: () => void } = {}) {
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
  return flow.sendJob ? <SendingScreen flow={flow} contacts={contacts} /> : <ReadyToSendScreen flow={flow} contacts={contacts} onChoosePeople={onChoose} />;
}

const openEdit = () => fireEvent.press(screen.getByRole('button', { name: 'Edit wording' }));
const primary = () => screen.getByRole('button', { name: 'Text 1 person' });
const bodyOfFirstLink = (open: jest.SpiedFunction<typeof Linking.openURL>) => decodeURIComponent(String(open.mock.calls[0][0])).split('body=')[1];

describe('Ready to send (Share the service)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('names the moment, with no Sample message and no What you will need button', () => {
    render(<Harness />);
    expect(screen.getByRole('heading', { name: 'Share the service' })).toBeTruthy();
    expect(screen.queryByText('Sample message')).toBeNull();
    expect(screen.queryByText("What you'll need")).toBeNull();
    expect(screen.queryByText('Review your message')).toBeNull();
  });

  it('shows the message as it will go, with the first-name line', () => {
    render(<Harness />);
    expect(screen.getByText('Dee,')).toBeTruthy();
    expect(screen.getByText(/Oak Chapel/)).toBeTruthy();
  });

  it('sends the edited text in the sms: link', async () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    render(<Harness />);
    openEdit();
    fireEvent.changeText(screen.getByLabelText('Your message'), 'Come as you are, 2 PM at Oak Chapel.');
    fireEvent.press(screen.getByText('Text 1 person'));
    fireEvent.press(await screen.findByText('Text Dee'));
    expect(decodeURIComponent(String(open.mock.calls[0][0]))).toContain('body=Dee,\nCome as you are, 2 PM at Oak Chapel.');
  });

  it('shows the same text it hands to Messages', async () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    open.mockClear();
    render(<Harness />);
    openEdit();
    fireEvent.changeText(screen.getByLabelText('Your message'), 'Come as you are.');
    fireEvent.press(screen.getByText('Text 1 person'));
    fireEvent.press(await screen.findByText('Text Dee'));
    const body = bodyOfFirstLink(open);
    expect(body).toBe('Dee,\nCome as you are.');
    expect(screen.getByText(body)).toBeTruthy();
  });

  it('sends the plain message with the switch off, and drops the first-name line', async () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    open.mockClear();
    render(<Harness />);
    openEdit();
    fireEvent.changeText(screen.getByLabelText('Your message'), 'Come as you are.');
    fireEvent.press(screen.getByRole('switch', { name: 'Start with their first name' }));
    expect(screen.queryByText('Dee,')).toBeNull();
    fireEvent.press(screen.getByText('Text 1 person'));
    fireEvent.press(await screen.findByText('Text Dee'));
    expect(bodyOfFirstLink(open)).toBe('Come as you are.');
  });

  it('keeps the switch in Edit wording, with an accessible name and state, and announces the greeting', () => {
    render(<Harness />);
    expect(screen.queryByRole('switch')).toBeNull();
    openEdit();
    const toggle = screen.getByRole('switch', { name: 'Start with their first name' });
    expect(toggle.props.accessibilityState).toEqual({ checked: true });
    fireEvent.press(toggle);
    expect(screen.getByRole('switch', { name: 'Start with their first name' }).props.accessibilityState).toEqual({ checked: false });
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibilityWithOptions').mockImplementation(() => undefined);
    fireEvent.press(screen.getByRole('switch', { name: 'Start with their first name' }));
    expect(announce).toHaveBeenCalledWith('For example: Dee,', { queue: true });
    expect(screen.getByText('Dee,')).toBeTruthy();
  });

  it('opens Edit wording in place with expanded state in its label, and closes it', () => {
    render(<Harness />);
    expect(screen.queryByLabelText('Your message')).toBeNull();
    openEdit();
    expect(screen.getByLabelText('Your message')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Edit wording' })).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: 'Done editing' }));
    expect(screen.queryByLabelText('Your message')).toBeNull();
  });

  it('blocks sending a blank message and says why', () => {
    render(<Harness />);
    openEdit();
    fireEvent.changeText(screen.getByLabelText('Your message'), '   ');
    expect(screen.getByText('Add a message before you send it.')).toBeTruthy();
    expect(primary().props.accessibilityState?.disabled).toBe(true);
    expect(screen.getByLabelText('Your message').props.value).toBe('   ');
  });

  describe('To row and the button', () => {
    it('puts the To row before the button in reading order, and the count with the button', () => {
      render(<Harness ids={TWO} />);
      const tree = JSON.stringify(screen.toJSON());
      expect(tree.indexOf('To Dee and Ana · 2')).toBeGreaterThan(-1);
      expect(tree.indexOf('To Dee and Ana')).toBeLessThan(tree.indexOf('Text 2 people'));
      expect(tree.indexOf('Change"')).toBeLessThan(tree.indexOf('Text 2 people'));
      expect(screen.getByText('One at a time, from your own number.')).toBeTruthy();
    });

    it('names the first 3 and says how many more', () => {
      render(<Harness ids={FIVE} />);
      expect(screen.getByText('To Dee, Ana, Ben and 2 more · 5')).toBeTruthy();
      expect(screen.getByText('Text 5 people')).toBeTruthy();
    });

    it('with nobody picked says Choose who to tell, and it opens the people step', () => {
      const onChoose = jest.fn();
      render(<Harness category="announcement" ids={NONE} onChoose={onChoose} />);
      expect(screen.queryByText(/^Text /)).toBeNull();
      expect(screen.queryByText('One at a time, from your own number.')).toBeNull();
      fireEvent.press(screen.getByRole('button', { name: 'Choose who to tell' }));
      expect(onChoose).toHaveBeenCalledTimes(1);
    });

    it('Change opens the people step', () => {
      const onChoose = jest.fn();
      render(<Harness onChoose={onChoose} />);
      fireEvent.press(screen.getByRole('button', { name: 'Change' }));
      expect(onChoose).toHaveBeenCalledTimes(1);
    });

    it('has no switch when nobody is picked', () => {
      render(<Harness category="announcement" ids={NONE} />);
      openEdit();
      expect(screen.queryByRole('switch')).toBeNull();
    });
  });

  describe('Details row', () => {
    it('changes the message when the date changes', () => {
      render(<Harness />);
      fireEvent.press(screen.getByRole('button', { name: 'Change date, time or place' }));
      expect(screen.getByLabelText('Service date').props.value).toBe('June 14');
      fireEvent.changeText(screen.getByLabelText('Service date'), 'June 20');
      expect(screen.getByText(/June 20/)).toBeTruthy();
      expect(screen.queryByText(/June 14/)).toBeNull();
    });

    it('opens on its own, blocks the button and says why while a required field is empty', () => {
      render(<Harness fields={{ serviceDate: 'June 14', serviceTime: '2:00 PM', serviceLocation: '' }} />);
      expect(screen.getByLabelText('Location, Needed')).toBeTruthy();
      expect(primary().props.accessibilityState?.disabled).toBe(true);
      // The button and Share elsewhere each carry the reason, so each points at its own line.
      expect(screen.getAllByText('Fill in the empty details to send.')).toHaveLength(2);
      fireEvent.changeText(screen.getByLabelText('Location, Needed'), 'Oak Chapel');
      expect(screen.queryByLabelText(/Needed/)).toBeNull();
      expect(primary().props.accessibilityState?.disabled).toBeFalsy();
    });

    it('is hidden for hand-edited text, and Use the suggested wording brings it back', () => {
      render(<Harness />);
      openEdit();
      fireEvent.changeText(screen.getByLabelText('Your message'), 'My own words.');
      expect(screen.queryByRole('button', { name: 'Change date, time or place' })).toBeNull();
      expect(screen.queryByLabelText('Service date')).toBeNull();
      expect(screen.getByLabelText('Your message').props.value).toBe('My own words.');
      fireEvent.press(screen.getByText('Use the suggested wording'));
      expect(screen.getByLabelText('Your message').props.value).toContain('June 14');
      fireEvent.press(screen.getByRole('button', { name: 'Change date, time or place' }));
      expect(screen.getByLabelText('Service date')).toBeTruthy();
    });
  });

  describe('Details row (Thank-you note)', () => {
    it('asks for the sender when setup has no name, and blocks the button', () => {
      render(<Harness thanks senderName="" fields={{}} />);
      expect(screen.getByRole('button', { name: 'Change details' })).toBeTruthy();
      expect(screen.getByLabelText('Your name or family name, Needed')).toBeTruthy();
      expect(primary().props.accessibilityState?.disabled).toBe(true);
    });

    it('shows only the personal note when setup has the name, and the message follows typing', () => {
      render(<Harness thanks senderName="The Hayes Family" fields={{}} />);
      fireEvent.press(screen.getByRole('button', { name: 'Change details' }));
      expect(screen.queryByLabelText(/Your name or family name/)).toBeNull();
      expect(screen.queryByLabelText(/Full name of the deceased/)).toBeNull();
      expect(primary().props.accessibilityState?.disabled).toBeFalsy();
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
  const shareButton = () => screen.getByRole('button', { name: 'Share elsewhere instead' });

  it('shows on the service, and shares the message without a greeting', async () => {
    const share = jest.spyOn(Share, 'share').mockResolvedValue(shared);
    render(<Harness />);
    expect(screen.getByText('Text 1 person')).toBeTruthy();
    openEdit();
    fireEvent.changeText(screen.getByLabelText('Your message'), 'Come as you are.');
    fireEvent.press(shareButton());
    await waitFor(() => expect(share).toHaveBeenCalledWith({ message: 'Come as you are.' }));
  });

  it('comes after the To row and before the button when people are picked', () => {
    render(<Harness />);
    const tree = JSON.stringify(screen.toJSON());
    expect(tree.indexOf('To Dee')).toBeLessThan(tree.indexOf('Share elsewhere instead'));
    expect(tree.indexOf('Share elsewhere instead')).toBeLessThan(tree.indexOf('Text 1 person'));
  });

  it('works with no one picked, and records nothing', async () => {
    const share = jest.spyOn(Share, 'share').mockResolvedValue(shared);
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    open.mockClear();
    render(<Harness ids={NONE} />);
    expect(screen.queryByText(/^Text /)).toBeNull();
    expect(screen.getByText('Choose who to tell')).toBeTruthy();
    fireEvent.press(shareButton());
    await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
    expect(open).not.toHaveBeenCalled();
    expect(screen.queryByText(/Sending|sent/i)).toBeNull();
  });

  it('is disabled with a share-specific hint when the message is blank', () => {
    const share = jest.spyOn(Share, 'share').mockResolvedValue(shared);
    render(<Harness ids={NONE} />);
    openEdit();
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
    openEdit();
    fireEvent.changeText(screen.getByLabelText('Your message'), 'A new line.');
    expect(screen.queryByText("That didn't go through. You can try again.")).toBeNull();
  });

  it('shows on the obituary', () => {
    render(<Harness category="obituary" ids={NONE} />);
    expect(shareButton()).toBeTruthy();
  });

  it('is not on the announcement or the thank-you, and the button is', () => {
    const { unmount } = render(<Harness category="announcement" />);
    expect(screen.queryByText('Share elsewhere instead')).toBeNull();
    expect(screen.getByText('Text 1 person')).toBeTruthy();
    unmount();
    render(<Harness thanks senderName="The Hayes Family" fields={{}} />);
    expect(screen.queryByText('Share elsewhere instead')).toBeNull();
    expect(screen.getByText('Text 1 person')).toBeTruthy();
  });
});
