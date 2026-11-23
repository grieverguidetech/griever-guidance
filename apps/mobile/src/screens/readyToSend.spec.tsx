import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { useEffect } from 'react';
import { AccessibilityInfo, Linking, ScrollView, Share, StyleSheet } from 'react-native';
import { screenCopy } from '@griever/copy';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import { freshDraft, useSendFlow } from '@griever/hooks';
import type { SectionFields, SessionDetails } from '@griever/shared';
import { ReadyToSendScreen } from './ReadyToSendScreen';
import { SendingScreen } from './SendingScreen';
import { onFlowPullRequest, registerManualPull } from '../lib/requestFlowPull';

const session = { personName: 'Margaret Hayes', dateOfPassing: '', senderName: 'Peter', obituaryUrl: '', obituaryPublisher: '', serviceDate: '',
  // The family has marked every step Ready on the web (without it the phone shows the nudge, #824, #949).
  announcementMessage: 'Margaret passed away peacefully.', serviceType: 'Funeral', thanksMessage: 'Thank you for being there.', obituaryText: 'Margaret loved the garden.',
  sectionStatus: { announcement: 'ready', service: 'ready', thanks: 'ready', obituary: 'ready' } } as SessionDetails & SectionFields;
const contacts = {
  contacts: [
    { contactId: 'c0', name: 'Dee', phone: '+15555550100' },
    { contactId: 'c1', name: 'Ana Lopez', phone: '+15555550101' },
    { contactId: 'c2', name: 'Ben', phone: '+15555550102' },
    { contactId: 'c3', name: 'Cal', phone: '+15555550103' },
    { contactId: 'c4', name: 'Eve', phone: '+15555550104' },
  ],
} as never;

// Jest has no native view tree, so findNodeHandle returns null. A fake handle per node lets a test see where focus was sent.
// This mock applies to the whole file.
const mockHandles = new Map<unknown, number>();
const mockHandleFor = (node: unknown) => {
  if (!mockHandles.has(node)) {
    mockHandles.set(node, mockHandles.size + 1);
  }
  return mockHandles.get(node);
};
jest.mock('react-native/Libraries/ReactNative/RendererProxy', () => ({
  ...jest.requireActual<object>('react-native/Libraries/ReactNative/RendererProxy'),
  findNodeHandle: (node: unknown) => (node ? mockHandleFor(node) : null),
}));

// Stable defaults: a new array each render would re-run the effect below.
const PICKED = ['c0'];
const NONE: string[] = [];
const FIVE = ['c0', 'c1', 'c2', 'c3', 'c4'];
const TWO = ['c0', 'c1'];

function Harness({ fields, thanks, senderName, category, ids = PICKED, onChoose = () => undefined, onGotIt = () => undefined, web = {}, loading = false }: { loading?: boolean; onGotIt?: () => void; fields?: Record<string, string>; thanks?: boolean; senderName?: string; category?: 'announcement' | 'obituary'; ids?: string[]; onChoose?: () => void; web?: Partial<SessionDetails & SectionFields> } = {}) {
  const flow = useSendFlow({
    session: loading ? null : { ...session, ...(senderName === undefined ? {} : { senderName }), ...web },
    draft: freshDraft({
      templateCategory: category ?? (thanks ? 'aftercare' : 'service'),
      templateOverrideId: category ? undefined : thanks ? 'thank-you-note' : 'share-service',
      step: 'review',
      fields: fields ?? { serviceDate: 'June 14', serviceTime: '2:00 PM', serviceLocation: 'Oak Chapel' },
    }),
  });
  const { selectContacts } = flow;
  useEffect(() => { selectContacts(ids); }, [selectContacts, ids]);
  return flow.sendJob ? <SendingScreen flow={flow} contacts={contacts} /> : <ReadyToSendScreen flow={flow} contacts={contacts} onChoosePeople={onChoose} onGotIt={onGotIt} />;
}

/** The message the box holds, whether it is reading (text) or editing (a field). */
const messageShown = (): string => {
  const box = screen.getByLabelText('Your message');
  return box.props.value ?? box.props.accessibilityValue.text;
};
/** Types into the box: one tap on Edit first when it is still reading (#968). */
const typeMessage = (text: string) => {
  const edit = screen.queryByRole('button', { name: 'Edit message' });
  if (edit) {
    fireEvent.press(edit);
  }
  fireEvent.changeText(screen.getByLabelText('Your message'), text);
};
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
    expect(messageShown()).toMatch(/Oak Chapel/);
  });

  it('lets the message box grow to fit the whole message (#963)', () => {
    render(<Harness />);
    fireEvent.press(screen.getByRole('button', { name: 'Edit message' }));
    const box = screen.getByLabelText('Your message');
    expect(box.props.multiline).toBe(true);
    // A line cap would stop the box at that height on iOS, so the rest would scroll inside it.
    expect(box.props.numberOfLines).toBeUndefined();
    expect(StyleSheet.flatten(box.props.style)).toMatchObject({ minHeight: 132 });
    expect(StyleSheet.flatten(box.props.style).maxHeight).toBeUndefined();
  });

  it('sends the edited text in the sms: link', async () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    render(<Harness />);
    typeMessage('Come as you are, 2 PM at Oak Chapel.');
    fireEvent.press(screen.getByText('Text 1 person'));
    fireEvent.press(await screen.findByText('Text Dee'));
    expect(decodeURIComponent(String(open.mock.calls[0][0]))).toContain('body=Dee,\nCome as you are, 2 PM at Oak Chapel.');
  });

  it('shows the same text it hands to Messages', async () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    open.mockClear();
    render(<Harness />);
    typeMessage('Come as you are.');
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
    typeMessage('Come as you are.');
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

  it('shows the message read-only with a caption and an Edit message button; Edit opens a focused box and Done returns', () => {
    render(<Harness />);
    expect(screen.getByLabelText('Your message').type).toBe('Text');
    expect(screen.getByText('Read it one last time and make any last changes.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Done editing' })).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: 'Edit message' }));
    expect(screen.getByLabelText('Your message').props.autoFocus).toBe(true);
    fireEvent.press(screen.getByRole('button', { name: 'Done editing' }));
    expect(screen.getByLabelText('Your message').type).toBe('Text');
  });

  it('blocks sending a blank message and says why', () => {
    render(<Harness />);
    typeMessage('   ');
    expect(screen.getByText('Add a message before you send it.')).toBeTruthy();
    expect(primary().props.accessibilityState?.disabled).toBe(true);
    expect(messageShown()).toBe('   ');
  });

  describe('The change-people button and the button', () => {
    it('has no names line, and puts the change-people button just before the action bar', () => {
      render(<Harness ids={TWO} />);
      expect(screen.queryByText(/^To /)).toBeNull();
      expect(screen.queryByText(/Dee and Ana/)).toBeNull();
      expect(screen.queryByText('Change')).toBeNull();
      const tree = JSON.stringify(screen.toJSON());
      expect(tree.indexOf("Change who you're texting")).toBeGreaterThan(-1);
      expect(tree.indexOf("Change who you're texting")).toBeLessThan(tree.indexOf('Text 2 people'));
      // The button is in the scrolling content, not in the bar.
      const bar = within(screen.getByTestId('ready-action-bar'));
      expect(bar.queryByText("Change who you're texting")).toBeNull();
      expect(bar.getByText('Text 2 people')).toBeTruthy();
      expect(screen.getByText('One at a time, from your own number.')).toBeTruthy();
    });

    it('stacks Share with another app, then Change who you\'re texting, in one left-aligned group', () => {
      render(<Harness ids={TWO} />);
      const group = screen.getByTestId('ready-share-change');
      expect(StyleSheet.flatten(group.props.style).alignSelf).toBe('flex-start');
      const names = within(group).getAllByRole('button').map((b) => b.props.accessibilityLabel ?? within(b).getByText(/./).props.children);
      expect(names).toEqual(['Share with another app', "Change who you're texting"]);
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
      expect(screen.queryByRole('button', { name: "Change who you're texting" })).toBeNull();
      expect(screen.queryByText('One at a time, from your own number.')).toBeNull();
      fireEvent.press(screen.getByRole('button', { name: 'Choose who to tell' }));
      expect(onChoose).toHaveBeenCalledTimes(1);
    });

    it('Change opens the people step', () => {
      const onChoose = jest.fn();
      render(<Harness onChoose={onChoose} />);
      fireEvent.press(screen.getByRole('button', { name: "Change who you're texting" }));
      expect(onChoose).toHaveBeenCalledTimes(1);
    });

    it('has no switch when nobody is picked', () => {
      render(<Harness category="announcement" ids={NONE} />);
      expect(screen.queryByRole('switch')).toBeNull();
    });
  });

  describe('Details row', () => {
    it('changes the message when the date changes', () => {
      render(<Harness fields={{ serviceDate: 'June 14', serviceTime: '2:00 PM', serviceLocation: '' }} />);
      expect(screen.getByLabelText('Service date').props.accessibilityValue.text).toBe('June 14');
      fireEvent.press(screen.getByLabelText('Service date'));
      fireEvent(screen.getByTestId('date-picker'), 'change', { type: 'set' }, new Date(2026, 5, 20));
      fireEvent.press(screen.getByRole('button', { name: 'Done' }));
      // The field and the message both show the new day.
      expect(messageShown()).toMatch(/June 20/);
      expect(messageShown()).not.toMatch(/June 14/);
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

    it('keeps the field on screen once the last missing detail is typed, and unblocks send', () => {
      render(<Harness fields={{ serviceDate: 'June 14', serviceTime: '2:00 PM', serviceLocation: '' }} />);
      fireEvent.changeText(screen.getByLabelText('Location, Needed'), 'Oak Chapel');
      expect(screen.getByDisplayValue('Oak Chapel')).toBeTruthy();
      expect(primary().props.accessibilityState?.disabled).toBeFalsy();
    });

    it('shows no service fields once the session loads with every detail filled', () => {
      const { rerender } = render(<Harness loading />);
      rerender(<Harness />);
      expect(screen.queryByLabelText('Service date')).toBeNull();
      expect(screen.queryByLabelText(/Needed/)).toBeNull();
    });

    it('has no toggle and no fields when every detail is filled', () => {
      render(<Harness />);
      expect(screen.queryByRole('button', { name: 'Change date, time or place' })).toBeNull();
      expect(screen.queryByLabelText('Service date')).toBeNull();
    });

    it('shows the fields with no toggle while a detail is missing', () => {
      render(<Harness fields={{ serviceDate: 'June 14', serviceTime: '2:00 PM', serviceLocation: '' }} />);
      expect(screen.getByLabelText('Service date')).toBeTruthy();
      expect(screen.queryByRole('button', { name: 'Change date, time or place' })).toBeNull();
    });

    it('is hidden for hand-edited text, and Use the suggested wording brings it back', () => {
      render(<Harness />);
      typeMessage('My own words.');
      expect(screen.queryByRole('button', { name: 'Change date, time or place' })).toBeNull();
      expect(screen.queryByLabelText('Service date')).toBeNull();
      expect(messageShown()).toBe('My own words.');
      fireEvent.press(screen.getByText('Use the suggested wording'));
      expect(messageShown()).toContain('June 14');
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
      expect(messageShown()).toMatch(/On behalf of ______, we want/);
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
      expect(messageShown()).toMatch(/Your flowers meant a lot\./);
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
    expect(messageShown()).toMatch(/She was peaceful\./);
  });

  it('is hidden once the person edits the words themselves', () => {
    render(<Harness category="announcement" fields={{}} />);
    typeMessage('My own words.');
    expect(screen.queryByRole('button', { name: 'Add a personal note' })).toBeNull();
  });
});

describe('Share elsewhere', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  const shared = { action: Share.sharedAction, activityType: undefined };
  const shareButton = () => screen.getByRole('button', { name: 'Share with another app' });

  it('shows on the service, and shares the message without a greeting', async () => {
    const share = jest.spyOn(Share, 'share').mockResolvedValue(shared);
    render(<Harness />);
    expect(screen.getByText('Text 1 person')).toBeTruthy();
    typeMessage('Come as you are.');
    fireEvent.press(shareButton());
    await waitFor(() => expect(share).toHaveBeenCalledWith({ message: 'Come as you are.' }));
  });

  it('comes before the action bar button when people are picked', () => {
    render(<Harness />);
    const tree = JSON.stringify(screen.toJSON());
    expect(tree.indexOf('Share with another app')).toBeLessThan(tree.indexOf('Text 1 person'));
    expect(within(screen.getByTestId('ready-action-bar')).queryByText('Share with another app')).toBeNull();
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
    typeMessage('   ');
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
    typeMessage('A new line.');
    expect(screen.queryByText("That didn't go through. You can try again.")).toBeNull();
  });

  it('shows on the obituary', () => {
    render(<Harness category="obituary" ids={NONE} />);
    expect(shareButton()).toBeTruthy();
  });

  it('is not on the announcement or the thank-you, and the button is', () => {
    const { unmount } = render(<Harness category="announcement" />);
    expect(screen.queryByText('Share with another app')).toBeNull();
    expect(screen.getByText('Text 1 person')).toBeTruthy();
    unmount();
    render(<Harness thanks senderName="The Hayes Family" fields={{}} />);
    expect(screen.queryByText('Share with another app')).toBeNull();
    expect(screen.getByText('Text 1 person')).toBeTruthy();
  });
});

describe('the people-button focus hook (#673)', () => {
  it('is cleared when the screen unmounts, so a late onDismiss finds nothing to call', () => {
    const hook: { current: (() => void) | null } = { current: null };
    const Host = () => {
      const flow = useSendFlow({ session, draft: freshDraft({ templateCategory: 'service', templateOverrideId: 'share-service', step: 'review', fields: {} }) });
      return <ReadyToSendScreen flow={flow} contacts={contacts} onChoosePeople={() => undefined} onGotIt={() => undefined} focusPeopleButton={hook} />;
    };
    const { unmount } = render(<Host />);
    expect(hook.current).toEqual(expect.any(Function));
    unmount();
    expect(hook.current).toBeNull();
  });
});

// #824: nothing written on the web for the flow, so the phone shows a nudge instead of the message and send controls.
describe('Ready to send with nothing written on the web (#824)', () => {
  const EMPTY = { announcementMessage: undefined, serviceMessage: '   ', serviceType: '', thanksMessage: '', obituaryText: '', sectionStatus: {} };
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
    expect(screen.queryByRole('button', { name: "Change who you're texting" })).toBeNull();
    expect(screen.queryByRole('button', { name: /Change date|Change details|Add a personal note/ })).toBeNull();
    expect(screen.queryByRole('switch')).toBeNull();
    expect(screen.queryByText(/!/)).toBeNull();
  });

  it('Got it calls the hub callback, and does not go back a step', () => {
    const onGotIt = jest.fn();
    const back = jest.fn();
    function Probe() {
      const flow = useSendFlow({ session: { ...session, ...EMPTY }, draft: freshDraft({ templateCategory: 'service', templateOverrideId: 'share-service', step: 'review', fields: {} }) });
      return <ReadyToSendScreen flow={{ ...flow, prevStep: back }} contacts={contacts} onChoosePeople={() => undefined} onGotIt={onGotIt} />;
    }
    render(<Probe />);
    fireEvent.press(screen.getByRole('button', { name: 'Got it' }));
    expect(onGotIt).toHaveBeenCalledTimes(1);
    expect(back).not.toHaveBeenCalled();
  });

  it('focuses the screen heading on arrival', async () => {
    const focus = jest.spyOn(AccessibilityInfo, 'setAccessibilityFocus').mockImplementation(() => undefined);
    render(<Harness web={EMPTY} />);
    await waitFor(() => {
      const nodes = focus.mock.calls.map(([handle]) => [...mockHandles.entries()].find(([, h]) => h === handle)?.[0]);
      expect(nodes.some((node) => (node as { props?: { children?: unknown } } | undefined)?.props?.children === 'Share the service')).toBe(true);
    });
  });

  it('reads heading, card heading, line, then Got it, and the card is not one accessible block', () => {
    render(<Harness web={EMPTY} />);
    const tree = JSON.stringify(screen.toJSON());
    const order = ['Share the service', 'Add the service details on the web first', 'Open web.grieversguidance.com', 'Got it'].map((t) => tree.indexOf(t));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((x, y) => x - y)).toEqual(order);
    let node = screen.getByRole('button', { name: 'Got it' }).parent;
    while (node) {
      if (typeof node.type === 'string') {
        expect(node.props?.accessible).not.toBe(true);
      }
      node = node.parent;
    }
  });

  it('keeps the normal screen when the words were already edited or a send is under way', () => {
    function Resumed() {
      const flow = useSendFlow({ session: { ...session, ...EMPTY }, draft: freshDraft({ templateCategory: 'service', templateOverrideId: 'share-service', step: 'review', fields: { serviceDate: 'June 14' }, messageOverride: 'My own words.' }) });
      return <ReadyToSendScreen flow={flow} contacts={contacts} onChoosePeople={() => undefined} onGotIt={() => undefined} />;
    }
    render(<Resumed />);
    expect(messageShown()).toBe('My own words.');
    expect(screen.queryByRole('button', { name: 'Got it' })).toBeNull();
  });

  it('shows the message box when only a different flow is not Ready', () => {
    render(<Harness web={{ ...EMPTY, sectionStatus: { service: 'ready' } }} />);
    expect(screen.getByLabelText('Your message')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Add the service details on the web first' })).toBeNull();
  });

  it('keeps the nudge when words were edited on the web but the step is not Ready', () => {
    render(<Harness web={{ ...EMPTY, serviceMessage: 'Come as you are.', sectionStatus: { service: 'in_progress' } }} />);
    expect(screen.getByRole('heading', { name: 'Add the service details on the web first' })).toBeTruthy();
  });

  it('shows the nudge again when the step is un-marked, and drops it when the step becomes Ready', () => {
    function Live({ ready }: { ready: boolean }) {
      const flow = useSendFlow({ session: { ...session, ...EMPTY, sectionStatus: ready ? { service: 'ready' } : {} } as SessionDetails, draft: freshDraft({ templateCategory: 'service', templateOverrideId: 'share-service', step: 'review', fields: {} }) });
      return <ReadyToSendScreen flow={flow} contacts={contacts} onChoosePeople={() => undefined} onGotIt={() => undefined} />;
    }
    const view = render(<Live ready={false} />);
    expect(screen.getByRole('button', { name: 'Got it' })).toBeTruthy();
    view.rerender(<Live ready />);
    expect(screen.queryByRole('button', { name: 'Got it' })).toBeNull();
    view.rerender(<Live ready={false} />);
    expect(screen.getByRole('button', { name: 'Got it' })).toBeTruthy();
  });

  it('asks the sync for a pull when the screen opens, once, and shows nothing for it', () => {
    const heard = jest.fn();
    const stop = onFlowPullRequest(heard);
    render(<Harness web={EMPTY} />);
    expect(heard).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/sync|pull|refresh/i)).toBeNull();
    stop();
  });
});

describe('pull to refresh on the send screen (#959)', () => {
  const failed = screenCopy('phoneRefresh').failed;
  const control = () => screen.UNSAFE_getAllByType(ScrollView)[0].props.refreshControl as { props: { refreshing: boolean; onRefresh: () => void } } | undefined;

  it('offers no pull when sync is not allowed', () => {
    render(<Harness />);
    expect(control()).toBeUndefined();
    expect(screen.queryByText(failed)).toBeNull();
  });

  it('shows the spinner until the pull ends, then nothing when it worked', async () => {
    let finish: (ok: boolean) => void = () => undefined;
    const stop = registerManualPull(() => new Promise<boolean>((resolve) => (finish = resolve)));
    render(<Harness />);
    act(() => control()?.props.onRefresh());
    expect(control()?.props.refreshing).toBe(true);
    await act(async () => finish(true));
    expect(control()?.props.refreshing).toBe(false);
    expect(screen.queryByText(failed)).toBeNull();
    stop();
  });

  it('stops the spinner and shows the calm line, announced, when the pull fails', async () => {
    const stop = registerManualPull(async () => false);
    render(<Harness />);
    await act(async () => control()?.props.onRefresh());
    expect(control()?.props.refreshing).toBe(false);
    expect(screen.getByText(failed).props.accessibilityLiveRegion).toBe('polite');
    stop();
  });
});

describe('pull to refresh on the send screen when the web has nothing yet (#959)', () => {
  it('puts the refresh control on the nudge view too', () => {
    const stop = registerManualPull(async () => true);
    render(<Harness web={{ sectionStatus: {} }} />);
    expect(screen.queryByLabelText('Your message')).toBeNull();
    expect(screen.UNSAFE_getAllByType(ScrollView)[0].props.refreshControl).toBeDefined();
    stop();
  });
});
