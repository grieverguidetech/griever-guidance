import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { useEffect } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { AccessibilityInfo, AppState, Linking, Text } from 'react-native';
import { freshDraft, useSendFlow } from '@griever/hooks';
import type { SessionDetails } from '@griever/shared';
import { ActionBar } from '../ui';
import { SendingScreen } from './SendingScreen';

// Jest has no native view tree, so findNodeHandle returns null. A fake handle lets the test see focus sent.
// Each node gets its own handle, so a test can tell which node focus was sent to.
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

// The handle of the node a button's ref points at, found by matching the button's own children.
const handleForButton = (name: string): number => {
  const { children } = screen.getByRole('button', { name }).props;
  for (const [node, handle] of mockHandles) {
    if ((node as { props?: { children?: unknown } }).props?.children === children) {
      return handle;
    }
  }
  throw new Error(`No focus handle for button ${name}`);
};

// The handle of the node a text's ref points at (a name heading), found by its own children.
// The newest match wins: earlier tests leave their nodes in the map.
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

const session = { personName: 'Margaret Hayes', dateOfPassing: '', senderName: 'Peter', obituaryUrl: '', obituaryPublisher: '', serviceDate: '' } as SessionDetails;
const all = [
  { contactId: 'c1', name: 'Dee', phone: '+15555550100' },
  { contactId: 'c2', name: 'Eli', phone: '+15555550101' },
  { contactId: 'c3', name: 'Fay', phone: '+15555550102' },
];

function Harness({ ids, category = 'announcement' }: { ids: string[]; category?: 'announcement' | 'aftercare' }) {
  const flow = useSendFlow({ session, draft: freshDraft({ templateCategory: category, step: 'review', fields: {} }) });
  const { selectContacts, startSendJob, sendJob } = flow;
  useEffect(() => {
    selectContacts(ids);
  }, [selectContacts, ids]);
  useEffect(() => {
    if (!sendJob && flow.selectedContactIds.length === ids.length) {
      startSendJob();
    }
  }, [sendJob, flow.selectedContactIds.length, ids.length, startSendJob]);
  return (
    <>
      <Text testID="step">{flow.step}</Text>
      <Text testID="statuses">{(sendJob?.recipients ?? []).map((r) => r.status).join(',')}</Text>
      <SendingScreen flow={flow} contacts={{ contacts: all } as never} />
    </>
  );
}

function setup(ids: string[], category: 'announcement' | 'aftercare' = 'announcement') {
  const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
  open.mockClear();
  const focus = jest.spyOn(AccessibilityInfo, 'setAccessibilityFocus').mockImplementation(() => undefined);
  const remove = jest.fn();
  let listener: (state: string) => void = () => undefined;
  jest.spyOn(AppState, 'addEventListener').mockImplementation(((_: string, cb: (state: string) => void) => {
    listener = cb;
    return { remove };
  }) as never);
  // A clock the test moves by hand. Coming back from Messages takes a few seconds; the hand-off guard reads it.
  let now = 1_700_000_000_000;
  jest.spyOn(Date, 'now').mockImplementation(() => now);
  const tick = (ms = 1500) => {
    now += ms;
  };
  const view = render(<Harness ids={ids} category={category} />);
  const change = (state: string) => {
    if (state === 'active') {
      tick(3000);
    }
    act(() => listener(state));
  };
  return { open, change, focus, remove, tick, unmount: view.unmount };
}

const PROMPT = 'Sent to Dee? Next: Eli';

describe('Sending on the phone: asking on return from Messages', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('shows the hand-off button as Text {name}', async () => {
    setup(['c1', 'c2']);
    expect(await screen.findByText('Text Dee')).toBeTruthy();
  });

  it('asks after background then active, and not before', async () => {
    const { change } = setup(['c1', 'c2']);
    fireEvent.press(await screen.findByText('Text Dee'));
    expect(screen.queryByText(PROMPT)).toBeNull();
    change('background');
    expect(screen.queryByText(PROMPT)).toBeNull();
    change('active');
    expect(await screen.findByText(PROMPT)).toBeTruthy();
    expect(screen.getByText('Not yet, open Messages again')).toBeTruthy();
    expect(screen.getByText('Skip Dee')).toBeTruthy();
  });

  it('puts the question on the bottom bar button, with Not yet and Skip above it as links', async () => {
    const { change } = setup(['c1', 'c2']);
    fireEvent.press(await screen.findByText('Text Dee'));
    change('background');
    change('active');
    await screen.findByText(PROMPT);
    const bar = screen.UNSAFE_getByType(ActionBar);
    expect(bar.props.label).toBe(PROMPT);
    const links = bar.props.above.props.children.map((link: { props: { label: string; variant: string } }) => [link.props.label, link.props.variant]);
    expect(links).toEqual([['Not yet, open Messages again', 'tertiary'], ['Skip Dee', 'tertiary']]);
  });

  it('puts only Skip above the bar before the hand-off, and the bar reads Text Dee', async () => {
    setup(['c1', 'c2']);
    await screen.findByText('Text Dee');
    const bar = screen.UNSAFE_getByType(ActionBar);
    expect(bar.props.label).toBe('Text Dee');
    expect(bar.props.above.props.label).toBe('Skip Dee');
    expect(screen.queryByText("What you'll need")).toBeNull();
  });

  it('does not ask after inactive then active (Control Center, notification shade)', async () => {
    const { change } = setup(['c1', 'c2']);
    fireEvent.press(await screen.findByText('Text Dee'));
    change('inactive');
    change('active');
    await new Promise((r) => setTimeout(r, 250));
    expect(screen.queryByText(PROMPT)).toBeNull();
  });

  it('shows no prompt when the app state never changes, and Next still works', async () => {
    const { change, tick } = setup(['c1', 'c2']);
    fireEvent.press(await screen.findByText('Text Dee'));
    change('active');
    expect(screen.queryByText(PROMPT)).toBeNull();
    tick();
    fireEvent.press(screen.getByText('Next'));
    expect(await screen.findByText('Text Eli')).toBeTruthy();
  });

  it('one tap marks Dee sent and opens Messages for Eli', async () => {
    const { open, change } = setup(['c1', 'c2']);
    fireEvent.press(await screen.findByText('Text Dee'));
    change('background');
    change('active');
    fireEvent.press(await screen.findByText(PROMPT));
    expect(open).toHaveBeenCalledTimes(2);
    const link = decodeURIComponent(String(open.mock.calls[1][0]));
    expect(link).toContain('+15555550101');
    expect(link).not.toContain('+15555550100');
    expect(link).toContain('Eli,');
    expect(decodeURIComponent(String(open.mock.calls[0][0]))).not.toContain('+15555550101');
    expect(await screen.findByText('2 of 2')).toBeTruthy();
    expect(screen.getByText('Sent')).toBeTruthy();
    // Eli is handed off already: Done shows, not Text Eli.
    expect(screen.getByText('Done')).toBeTruthy();
    expect(screen.queryByText('Text Eli')).toBeNull();
  });

  it('Not yet closes the prompt, keeps Dee active and opens Messages for Dee again', async () => {
    const { open, change } = setup(['c1', 'c2']);
    fireEvent.press(await screen.findByText('Text Dee'));
    change('background');
    change('active');
    fireEvent.press(await screen.findByText('Not yet, open Messages again'));
    expect(screen.queryByText(PROMPT)).toBeNull();
    expect(screen.getByText('1 of 2')).toBeTruthy();
    expect(screen.getByTestId('statuses').props.children).toBe('sending,queued');
    expect(open).toHaveBeenCalledTimes(2);
    expect(decodeURIComponent(String(open.mock.calls[1][0]))).toContain('+15555550100');
    // Back to the hand-off state: Next is the fallback, and the note is read again.
    expect(screen.getByText('Next')).toBeTruthy();
    expect(screen.getByText('Send it in Messages, then come back and tap Next.')).toBeTruthy();
  });

  it('Skip still works from the prompt', async () => {
    const { change } = setup(['c1', 'c2']);
    fireEvent.press(await screen.findByText('Text Dee'));
    change('background');
    change('active');
    await screen.findByText(PROMPT);
    fireEvent.press(screen.getByText('Skip Dee'));
    expect(await screen.findByText('Text Eli')).toBeTruthy();
    expect(screen.getByText('Skipped')).toBeTruthy();
  });

  it('shows Done on the last person, opens nothing more, and the prompt is gone', async () => {
    const { open, change } = setup(['c1']);
    fireEvent.press(await screen.findByText('Text Dee'));
    change('background');
    change('active');
    fireEvent.press(await screen.findByText('Sent to Dee? Done'));
    expect(open).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Sent to Dee? Done')).toBeNull();
    expect(screen.queryByText('Not yet, open Messages again')).toBeNull();
    expect(screen.getByText('Sent')).toBeTruthy();
  });

  it('falls back to Text Eli when Messages will not open for the next person', async () => {
    const { open, change, focus } = setup(['c1', 'c2']);
    open.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('no handler'));
    fireEvent.press(await screen.findByText('Text Dee'));
    change('background');
    change('active');
    fireEvent.press(await screen.findByText(PROMPT));
    expect(await screen.findByText('Text Eli')).toBeTruthy();
    expect(screen.queryByText('Done')).toBeNull();
    expect(screen.getByText("Messages didn't open on this phone. You can skip Eli and text them yourself later.")).toBeTruthy();
    await waitFor(() => expect(focus).toHaveBeenLastCalledWith(handleForButton('Text Eli')));
  });

  it('a second press in the same moment cannot mark the next person', async () => {
    const { open, change } = setup(['c1', 'c2', 'c3']);
    fireEvent.press(await screen.findByText('Text Dee'));
    change('background');
    change('active');
    const yes = await screen.findByText(PROMPT);
    act(() => {
      fireEvent.press(yes);
      fireEvent.press(yes);
    });
    expect(await screen.findByText('2 of 3')).toBeTruthy();
    expect(screen.getByText('Eli')).toBeTruthy();
    // Eli is still the active person: one hand-off for Dee, one for Eli, and Fay has not been reached.
    expect(open).toHaveBeenCalledTimes(2);
    expect(screen.getAllByText('Sent')).toHaveLength(1);
    expect(screen.getByText('Waiting')).toBeTruthy();
  });

  it('chains: yes on Dee, then returning again asks about Eli with Done', async () => {
    const { change } = setup(['c1', 'c2']);
    fireEvent.press(await screen.findByText('Text Dee'));
    change('background');
    change('active');
    fireEvent.press(await screen.findByText(PROMPT));
    change('background');
    change('active');
    expect(await screen.findByText('Sent to Eli? Done')).toBeTruthy();
  });

  it('stops listening when the screen goes away', async () => {
    const { change, remove, unmount } = setup(['c1', 'c2']);
    fireEvent.press(await screen.findByText('Text Dee'));
    change('background');
    unmount();
    expect(remove).toHaveBeenCalled();
  });

  it('moves screen-reader focus to the question a moment after returning, and back after Not yet', async () => {
    const { change, focus } = setup(['c1', 'c2']);
    fireEvent.press(await screen.findByText('Text Dee'));
    const before = focus.mock.calls.length;
    const handleOf = (name: string) => handleForButton(name);
    change('background');
    change('active');
    expect(focus.mock.calls.length).toBe(before);
    await screen.findByText(PROMPT);
    expect(focus.mock.calls.length).toBe(before + 1);
    expect(focus).toHaveBeenLastCalledWith(handleOf(PROMPT));
    expect(screen.getByRole('button', { name: PROMPT }).props.accessibilityHint).toBe('Marks Dee sent and opens Messages for Eli');
    fireEvent.press(screen.getByText('Not yet, open Messages again'));
    expect(focus.mock.calls.length).toBe(before + 2);
    expect(focus).toHaveBeenLastCalledWith(handleOf('Next'));
  });

  it('clears the old tap-Next note while the question shows', async () => {
    const { change } = setup(['c1', 'c2']);
    fireEvent.press(await screen.findByText('Text Dee'));
    expect(screen.getByText('Send it in Messages, then come back and tap Next.')).toBeTruthy();
    change('background');
    change('active');
    await screen.findByText(PROMPT);
    expect(screen.queryByText('Send it in Messages, then come back and tap Next.')).toBeNull();
  });
});

describe('Sending on the phone: a line for each person (thank-you)', () => {
  const line = (name: string) => `Add a line for ${name} (optional)`;
  const body = (open: { mock: { calls: unknown[][] } }, call: number) => decodeURIComponent(String(open.mock.calls[call][0]));

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('gives each person their own note on the last line', async () => {
    const { open, tick } = setup(['c1', 'c2'], 'aftercare');
    fireEvent.changeText(await screen.findByLabelText(line('Dee')), 'Thank you for the lasagna');
    // The card shows the message with the note before the hand-off.
    expect(screen.getByText(/Thank you for the lasagna$/)).toBeTruthy();
    fireEvent.press(screen.getByText('Text Dee'));
    expect(body(open, 0).endsWith('\nThank you for the lasagna')).toBe(true);
    tick();
    fireEvent.press(screen.getByText('Next'));
    fireEvent.changeText(await screen.findByLabelText(line('Eli')), 'Thank you for the flowers');
    fireEvent.press(screen.getByText('Text Eli'));
    expect(body(open, 1).endsWith('\nThank you for the flowers')).toBe(true);
    expect(body(open, 1)).not.toContain('lasagna');
  });

  it('Not yet opens Messages again with the same line for the same person', async () => {
    const { change, open } = setup(['c1', 'c2'], 'aftercare');
    fireEvent.changeText(await screen.findByLabelText(line('Dee')), 'Thanks again');
    fireEvent.press(screen.getByText('Text Dee'));
    change('background');
    change('active');
    fireEvent.press(await screen.findByText('Not yet, open Messages again'));
    expect(open).toHaveBeenCalledTimes(2);
    expect(body(open, 1).endsWith('\nThanks again')).toBe(true);
    expect(body(open, 1)).toContain('+15555550100');
  });

  it('has no input on other moments', async () => {
    setup(['c1', 'c2']);
    await screen.findByText('Text Dee');
    expect(screen.queryByLabelText(line('Dee'))).toBeNull();
  });
});

describe('Sending on the phone: a send is never lost or repeated', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('ignores Next pressed right after a hand-off, then accepts it', async () => {
    const { tick } = setup(['c1', 'c2']);
    fireEvent.press(await screen.findByText('Text Dee'));
    fireEvent.press(screen.getByText('Next'));
    expect(screen.getByText('1 of 2')).toBeTruthy();
    expect(screen.queryByText('Sent')).toBeNull();
    tick();
    fireEvent.press(screen.getByText('Next'));
    expect(await screen.findByText('Text Eli')).toBeTruthy();
    expect(screen.getByText('Sent')).toBeTruthy();
  });

  it('does not mark the next person sent when the Sent question is tapped twice', async () => {
    const { change, open } = setup(['c1', 'c2', 'c3']);
    fireEvent.press(await screen.findByText('Text Dee'));
    change('background');
    change('active');
    fireEvent.press(await screen.findByText(PROMPT));
    // The next card's button now sits where the question was; this tap is the same tap.
    fireEvent.press(screen.getByText('Next'));
    expect(screen.getByText('2 of 3')).toBeTruthy();
    expect(open).toHaveBeenCalledTimes(2);
  });

  it('thank-you: confirming Sent moves to the next card without opening Messages, so the note shows', async () => {
    const { change, open } = setup(['c1', 'c2'], 'aftercare');
    fireEvent.press(await screen.findByText('Text Dee'));
    change('background');
    change('active');
    fireEvent.press(await screen.findByText(PROMPT));
    expect(open).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('Text Eli')).toBeTruthy();
    expect(screen.getByLabelText('Add a line for Eli (optional)')).toBeTruthy();
  });

  it('thank-you: the question says it does not open Messages', async () => {
    const { change } = setup(['c1', 'c2'], 'aftercare');
    fireEvent.press(await screen.findByText('Text Dee'));
    change('background');
    change('active');
    await screen.findByText(PROMPT);
    expect(screen.getByRole('button', { name: PROMPT }).props.accessibilityHint).toBe('Marks Dee sent. Then you can add a line for Eli');
  });

  it('thank-you: moving to the next card focuses the name, so the line is heard before Text', async () => {
    const { change, focus } = setup(['c1', 'c2'], 'aftercare');
    fireEvent.press(await screen.findByText('Text Dee'));
    change('background');
    change('active');
    fireEvent.press(await screen.findByText(PROMPT));
    await screen.findByText('Text Eli');
    await waitFor(() => expect(focus).toHaveBeenLastCalledWith(handleForText('Eli')));
    expect(focus).not.toHaveBeenLastCalledWith(handleForButton('Text Eli'));
  });

  it('thank-you: a tap on Text Eli right after confirming Dee does not open Messages', async () => {
    const { change, open, tick } = setup(['c1', 'c2'], 'aftercare');
    fireEvent.press(await screen.findByText('Text Dee'));
    change('background');
    change('active');
    fireEvent.press(await screen.findByText(PROMPT));
    // The same double tap lands on the Text button that took the question's place.
    fireEvent.press(await screen.findByText('Text Eli'));
    expect(open).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('Add a line for Eli (optional)')).toBeTruthy();
    tick();
    fireEvent.press(screen.getByText('Text Eli'));
    expect(open).toHaveBeenCalledTimes(2);
  });

  it('puts the Messages error in the Text button hint so focus does not cut it off', async () => {
    const { open } = setup(['c1', 'c2']);
    open.mockRejectedValueOnce(new Error('no handler'));
    fireEvent.press(await screen.findByText('Text Dee'));
    const error = "Messages didn't open on this phone. You can skip Dee and text them yourself later.";
    expect(await screen.findByText(error)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Text Dee' }).props.accessibilityHint).toBe(error);
  });

  it('Stop for now sits in the top bar with the note as its hint, and the note is not drawn', async () => {
    setup(['c1', 'c2']);
    await screen.findByText('Text Dee');
    expect(screen.getByRole('button', { name: 'Stop for now' }).props.accessibilityHint).toBe('People you told stay marked as told.');
    expect(screen.queryByText('People you told stay marked as told.', { includeHiddenElements: true })).toBeNull();
    expect(screen.getByText('1 of 2')).toBeTruthy();
  });

  it('Stop for now keeps only the people confirmed with a tap', async () => {
    const { change } = setup(['c1', 'c2', 'c3']);
    fireEvent.press(await screen.findByText('Text Dee'));
    change('background');
    change('active');
    fireEvent.press(await screen.findByText(PROMPT));
    await screen.findByText('2 of 3');
    fireEvent.press(screen.getByText('Stop for now'));
    expect(screen.getByTestId('step').props.children).toBe('sent');
    // Eli was handed off but never confirmed, so Eli is not marked sent.
    expect(screen.getByTestId('statuses').props.children).toBe('delivered,sending,queued');
  });

  it('Stop for now ends the send for this flow', async () => {
    setup(['c1', 'c2']);
    await screen.findByText('Text Dee');
    expect(screen.getByTestId('step').props.children).toBe('sending');
    fireEvent.press(screen.getByText('Stop for now'));
    expect(screen.getByTestId('step').props.children).toBe('sent');
  });
});
