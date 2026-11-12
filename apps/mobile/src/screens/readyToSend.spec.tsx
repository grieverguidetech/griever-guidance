import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { useEffect } from 'react';
import { AccessibilityInfo, Linking, Share, StyleSheet } from 'react-native';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import { freshDraft, useSendFlow } from '@griever/hooks';
import type { SectionFields, SessionDetails } from '@griever/shared';
import { ReadyToSendScreen } from './ReadyToSendScreen';
import { SendingScreen } from './SendingScreen';

const session = { personName: 'Margaret Hayes', dateOfPassing: '', senderName: 'Peter', obituaryUrl: '', obituaryPublisher: '', serviceDate: '',
  // The family has written something on the web for every flow (without it the phone shows the nudge, #824).
  announcementMessage: 'Margaret passed away peacefully.', serviceMessage: 'Come as you are.', thanksMessage: 'Thank you for being there.', obituaryText: 'Margaret loved the garden.' } as SessionDetails;
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

function Harness({ fields, thanks, senderName, category, ids = PICKED, onChoose = () => undefined, web = {} }: { fields?: Record<string, string>; thanks?: boolean; senderName?: string; category?: 'announcement' | 'obituary'; ids?: string[]; onChoose?: () => void; web?: Partial<SessionDetails & SectionFields> } = {}) {
  const flow = useSendFlow({
    session: { ...session, ...(senderName === undefined ? {} : { senderName }), ...web },
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
    expect(screen.getByDisplayValue(/Oak Chapel/)).toBeTruthy();
  });

  it('sends the edited text in the sms: link', async () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    render(<Harness />);
    fireEvent.changeText(screen.getByLabelText('Your message'), 'Come as you are, 2 PM at Oak Chapel.');
    fireEvent.press(screen.getByText('Text 1 person'));
    fireEvent.press(await screen.findByText('Text Dee'));
    expect(decodeURIComponent(String(open.mock.calls[0][0]))).toContain('body=Dee,\nCome as you are, 2 PM at Oak Chapel.');
  });

  it('shows the same text it hands to Messages', async () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    open.mockClear();
    render(<Harness />);
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
    fireEvent.changeText(screen.getByLabelText('Your message'), 'Come as you are.');
    fireEvent.press(screen.getByRole('switch', { name: 'Start with their first name' }));
    expect(screen.queryByText('Dee,')).toBeNull();
    fireEvent.press(screen.getByText('Text 1 person'));
    fireEvent.press(await screen.findByText('Text Dee'));
    expect(bodyOfFirstLink(open)).toBe('Come as you are.');
  });

  it('shows the switch under the box, with an accessible name and state, and announces the greeting', () => {
    render(<Harness />);
    const toggle = screen.getByRole('switch', { name: 'Start with their first name' });
    expect(toggle.props.accessibilityState).toEqual({ checked: true });
    fireEvent.press(toggle);
    expect(screen.getByRole('switch', { name: 'Start with their first name' }).props.accessibilityState).toEqual({ checked: false });
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibilityWithOptions').mockImplementation(() => undefined);
    fireEvent.press(screen.getByRole('switch', { name: 'Start with their first name' }));
    expect(announce).toHaveBeenCalledWith('For example: Dee,', { queue: true });
    expect(screen.getByText('Dee,')).toBeTruthy();
  });

  it('always shows the message in an editable box with a caption, and no Edit or Done editing button', () => {
    render(<Harness />);
    const box = screen.getByLabelText('Your message');
    expect(box.props.multiline).toBe(true);
    expect(box.props.autoFocus).toBeFalsy();
    expect(screen.getByText('Read it one last time and make any last changes.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Edit wording' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Done editing' })).toBeNull();
  });

  it('blocks sending a blank message and says why', () => {
    render(<Harness />);
    fireEvent.changeText(screen.getByLabelText('Your message'), '   ');
    expect(screen.getByText('Add a message before you send it.')).toBeTruthy();
    expect(primary().props.accessibilityState?.disabled).toBe(true);
    expect(screen.getByLabelText('Your message').props.value).toBe('   ');
  });

  describe('Change who gets this and the button', () => {
    it('has no names line, and puts Change who gets this just before the action bar', () => {
      render(<Harness ids={TWO} />);
      expect(screen.queryByText(/^To /)).toBeNull();
      expect(screen.queryByText(/Dee and Ana/)).toBeNull();
      expect(screen.queryByText('Change')).toBeNull();
      const tree = JSON.stringify(screen.toJSON());
      expect(tree.indexOf('Change who gets this')).toBeGreaterThan(-1);
      expect(tree.indexOf('Change who gets this')).toBeLessThan(tree.indexOf('Text 2 people'));
      // The button is in the scrolling content, not in the bar.
      const bar = within(screen.getByTestId('ready-action-bar'));
      expect(bar.queryByText('Change who gets this')).toBeNull();
      expect(bar.getByText('Text 2 people')).toBeTruthy();
      expect(screen.getByText('One at a time, from your own number.')).toBeTruthy();
    });

    it('shows no names line for five people either, and the button count stays', () => {
      render(<Harness ids={FIVE} />);
      expect(screen.queryByText(/^To /)).toBeNull();
      expect(screen.queryByText(/more · 5/)).toBeNull();
      expect(screen.getByText('Text 5 people')).toBeTruthy();
    });

    it('with nobody picked says Choose who to tell, and it opens the people step', () => {
      const onChoose = jest.fn();
      render(<Harness category="announcement" ids={NONE} onChoose={onChoose} />);
      expect(screen.queryByText(/^Text /)).toBeNull();
      expect(screen.queryByText(/^To /)).toBeNull();
      expect(screen.queryByRole('button', { name: 'Change who gets this' })).toBeNull();
      expect(screen.queryByText('One at a time, from your own number.')).toBeNull();
      fireEvent.press(screen.getByRole('button', { name: 'Choose who to tell' }));
      expect(onChoose).toHaveBeenCalledTimes(1);
    });

    it('Change opens the people step', () => {
      const onChoose = jest.fn();
      render(<Harness onChoose={onChoose} />);
      fireEvent.press(screen.getByRole('button', { name: 'Change who gets this' }));
      expect(onChoose).toHaveBeenCalledTimes(1);
    });

    it('has no switch when nobody is picked', () => {
      render(<Harness category="announcement" ids={NONE} />);
      expect(screen.queryByRole('switch')).toBeNull();
    });
  });

  describe('Details row', () => {
    it('changes the message when the date changes', () => {
      render(<Harness />);
      fireEvent.press(screen.getByRole('button', { name: 'Change date, time or place' }));
      expect(screen.getByLabelText('Service date').props.accessibilityValue.text).toBe('June 14');
      fireEvent.press(screen.getByLabelText('Service date'));
      fireEvent(screen.getByTestId('date-picker'), 'change', { type: 'set' }, new Date(2026, 5, 20));
      fireEvent.press(screen.getByRole('button', { name: 'Done' }));
      // The field and the message both show the new day.
      expect(screen.getByLabelText('Your message').props.value).toMatch(/June 20/);
      expect(screen.queryByDisplayValue(/June 14/)).toBeNull();
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

    it('shows ______ for the missing name, never sends it, and sends the typed name (#693)', async () => {
      const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
      open.mockClear();
      render(<Harness thanks senderName="" fields={{}} />);
      expect(screen.getByDisplayValue(/On behalf of ______, we want/)).toBeTruthy();
      expect(screen.queryByText(/undefined/)).toBeNull();
      expect(primary().props.accessibilityState?.disabled).toBe(true);
      fireEvent.press(primary());
      expect(open).not.toHaveBeenCalled();
      fireEvent.changeText(screen.getByLabelText('Your name or family name, Needed'), 'The Hayes Family');
      expect(primary().props.accessibilityState?.disabled).toBeFalsy();
      fireEvent.press(primary());
      fireEvent.press(await screen.findByText('Text Dee'));
      const body = bodyOfFirstLink(open);
      expect(body).toContain('On behalf of The Hayes Family');
      expect(body).not.toContain('______');
      expect(body).not.toContain('undefined');
    });

    it('shows only the personal note when setup has the name, and the message follows typing', () => {
      render(<Harness thanks senderName="The Hayes Family" fields={{}} />);
      fireEvent.press(screen.getByRole('button', { name: 'Change details' }));
      expect(screen.queryByLabelText(/Your name or family name/)).toBeNull();
      expect(screen.queryByLabelText(/Full name of the deceased/)).toBeNull();
      expect(primary().props.accessibilityState?.disabled).toBeFalsy();
      fireEvent.changeText(screen.getByLabelText('Personal note (optional)'), 'Your flowers meant a lot.');
      expect(screen.getByLabelText('Your message').props.value).toMatch(/Your flowers meant a lot\./);
    });
  });
});

describe('Details row (Announce the passing)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('has the optional note under Add a personal note, closed, and the message follows typing', () => {
    render(<Harness category="announcement" fields={{}} />);
    expect(screen.queryByLabelText(/Anything you'd like to add/)).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: 'Add a personal note' }));
    // Name and date come from setup, so the note is the only field; it never blocks the button.
    expect(screen.queryByLabelText(/Full name of the deceased/)).toBeNull();
    expect(primary().props.accessibilityState?.disabled).toBeFalsy();
    const input = screen.getByLabelText("Anything you'd like to add (optional)");
    expect(input.props.multiline).toBe(true);
    expect(input.props.numberOfLines).toBe(3);
    expect(input.props.placeholder).toBe('For example: It was peaceful, and we were with them.');
    expect(StyleSheet.flatten(input.props.style)).toMatchObject({ minHeight: 88, textAlignVertical: 'top' });
    fireEvent.changeText(input, 'She was peaceful.');
    expect(screen.getByLabelText('Your message').props.value).toMatch(/She was peaceful\./);
  });

  it('is hidden once the person edits the words themselves', () => {
    render(<Harness category="announcement" fields={{}} />);
    fireEvent.changeText(screen.getByLabelText('Your message'), 'My own words.');
    expect(screen.queryByRole('button', { name: 'Add a personal note' })).toBeNull();
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
    fireEvent.changeText(screen.getByLabelText('Your message'), 'Come as you are.');
    fireEvent.press(shareButton());
    await waitFor(() => expect(share).toHaveBeenCalledWith({ message: 'Come as you are.' }));
  });

  it('comes before the action bar button when people are picked', () => {
    render(<Harness />);
    const tree = JSON.stringify(screen.toJSON());
    expect(tree.indexOf('Share elsewhere instead')).toBeLessThan(tree.indexOf('Text 1 person'));
    expect(within(screen.getByTestId('ready-action-bar')).queryByText('Share elsewhere instead')).toBeNull();
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

describe('the people-button focus hook (#673)', () => {
  it('is cleared when the screen unmounts, so a late onDismiss finds nothing to call', () => {
    const hook: { current: (() => void) | null } = { current: null };
    const Host = () => {
      const flow = useSendFlow({ session, draft: freshDraft({ templateCategory: 'service', templateOverrideId: 'share-service', step: 'review', fields: {} }) });
      return <ReadyToSendScreen flow={flow} contacts={contacts} onChoosePeople={() => undefined} focusPeopleButton={hook} />;
    };
    const { unmount } = render(<Host />);
    expect(hook.current).toEqual(expect.any(Function));
    unmount();
    expect(hook.current).toBeNull();
  });
});

// #824: nothing written on the web for the flow, so the phone shows a nudge instead of the message and send controls.
describe('Ready to send with nothing written on the web (#824)', () => {
  const EMPTY = { announcementMessage: undefined, serviceMessage: '   ', thanksMessage: '', obituaryText: '' };
  const cases = [
    ['service', {}, 'Share the service', 'Add the service details on the web first'],
    ['thanks', { thanks: true }, 'Send thank-yous', 'Write the thank-you note on the web first'],
    ['announcement', { category: 'announcement' as const }, 'Announce the passing', 'Write the announcement on the web first'],
  ] as const;

  it.each(cases)('%s: shows the nudge under the moment heading, with no message box, no Send and nothing to fill in', (_name, props, title, nudge) => {
    render(<Harness {...props} web={EMPTY} />);
    expect(screen.getByRole('heading', { name: title })).toBeTruthy();
    expect(screen.getByRole('heading', { name: nudge })).toBeTruthy();
    expect(screen.getByText(/web\.grieversguidance\.com/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Back' })).toBeTruthy();
    expect(screen.queryByLabelText('Your message')).toBeNull();
    expect(screen.queryByRole('button', { name: /^Text \d/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Choose who to tell' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Change who gets this' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Change date|Change details|Add a personal note/ })).toBeNull();
    expect(screen.queryByRole('switch')).toBeNull();
    expect(screen.queryByText(/!/)).toBeNull();
  });

  it('Got it goes back the way Back does', () => {
    // The app's Back from Ready to send goes to the hub; here it is the flow's step back, once.
    const back = jest.fn();
    function Probe() {
      const flow = useSendFlow({ session: { ...session, ...EMPTY }, draft: freshDraft({ templateCategory: 'service', templateOverrideId: 'share-service', step: 'review', fields: {} }) });
      return <ReadyToSendScreen flow={{ ...flow, prevStep: back }} onChoosePeople={() => undefined} />;
    }
    render(<Probe />);
    fireEvent.press(screen.getByRole('button', { name: 'Got it' }));
    expect(back).toHaveBeenCalledTimes(1);
    fireEvent.press(screen.getByRole('button', { name: 'Back' }));
    expect(back).toHaveBeenCalledTimes(2);
  });

  it('marks the nudge as one summary region', () => {
    render(<Harness web={EMPTY} />);
    // One region holds the heading, the line and the button, so it is announced once.
    expect(screen.UNSAFE_getAllByProps({ accessibilityRole: 'summary' }).length).toBeGreaterThan(0);
  });

  it('shows the message box when only a different flow is empty', () => {
    render(<Harness web={{ ...EMPTY, serviceMessage: 'Come as you are.' }} />);
    expect(screen.getByLabelText('Your message')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Add the service details on the web first' })).toBeNull();
  });
});
