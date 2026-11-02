import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { useEffect } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { AccessibilityInfo, AppState, Linking } from 'react-native';
import { freshDraft, useSendFlow } from '@griever/hooks';
import type { SessionDetails } from '@griever/shared';
import { SendingScreen } from './SendingScreen';

// Jest has no native view tree, so findNodeHandle returns null. A fake handle lets the test see focus sent.
jest.mock('react-native/Libraries/ReactNative/RendererProxy', () => ({
  ...jest.requireActual<object>('react-native/Libraries/ReactNative/RendererProxy'),
  findNodeHandle: (node: unknown) => (node ? 1 : null),
}));

const session = { personName: 'Margaret Hayes', dateOfPassing: '', senderName: 'Peter', obituaryUrl: '', obituaryPublisher: '', serviceDate: '' } as SessionDetails;
const all = [
  { contactId: 'c1', name: 'Dee', phone: '+15555550100' },
  { contactId: 'c2', name: 'Eli', phone: '+15555550101' },
  { contactId: 'c3', name: 'Fay', phone: '+15555550102' },
];

function Harness({ ids }: { ids: string[] }) {
  const flow = useSendFlow({ session, draft: freshDraft({ templateCategory: 'announcement', step: 'review', fields: {} }) });
  const { selectContacts, startSendJob, sendJob } = flow;
  useEffect(() => {
    selectContacts(ids);
  }, [selectContacts, ids]);
  useEffect(() => {
    if (!sendJob && flow.selectedContactIds.length === ids.length) {
      startSendJob();
    }
  }, [sendJob, flow.selectedContactIds.length, ids.length, startSendJob]);
  return <SendingScreen flow={flow} contacts={{ contacts: all } as never} />;
}

function setup(ids: string[]) {
  const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
  open.mockClear();
  const focus = jest.spyOn(AccessibilityInfo, 'setAccessibilityFocus').mockImplementation(() => undefined);
  const remove = jest.fn();
  let listener: (state: string) => void = () => undefined;
  jest.spyOn(AppState, 'addEventListener').mockImplementation(((_: string, cb: (state: string) => void) => {
    listener = cb;
    return { remove };
  }) as never);
  const view = render(<Harness ids={ids} />);
  const change = (state: string) => act(() => listener(state));
  return { open, change, focus, remove, unmount: view.unmount };
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
    expect(screen.getByText('Not yet')).toBeTruthy();
    expect(screen.getByText('Skip')).toBeTruthy();
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
    const { change } = setup(['c1', 'c2']);
    fireEvent.press(await screen.findByText('Text Dee'));
    change('active');
    expect(screen.queryByText(PROMPT)).toBeNull();
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
    expect(link).toContain('Eli,');
    expect(await screen.findByText('2 of 2')).toBeTruthy();
    expect(screen.getByText('Sent')).toBeTruthy();
    // Eli is handed off already: Done shows, not Text Eli.
    expect(screen.getByText('Done')).toBeTruthy();
    expect(screen.queryByText('Text Eli')).toBeNull();
  });

  it('Not yet closes the prompt and keeps Dee active with Text Dee', async () => {
    const { open, change } = setup(['c1', 'c2']);
    fireEvent.press(await screen.findByText('Text Dee'));
    change('background');
    change('active');
    fireEvent.press(await screen.findByText('Not yet'));
    expect(screen.queryByText(PROMPT)).toBeNull();
    expect(screen.getByText('Text Dee')).toBeTruthy();
    expect(screen.getByText('1 of 2')).toBeTruthy();
    expect(open).toHaveBeenCalledTimes(1);
  });

  it('Skip still works from the prompt', async () => {
    const { change } = setup(['c1', 'c2']);
    fireEvent.press(await screen.findByText('Text Dee'));
    change('background');
    change('active');
    await screen.findByText(PROMPT);
    fireEvent.press(screen.getByText('Skip'));
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
    expect(screen.queryByText('Not yet')).toBeNull();
    expect(screen.getByText('Sent')).toBeTruthy();
  });

  it('falls back to Text Eli when Messages will not open for the next person', async () => {
    const { open, change } = setup(['c1', 'c2']);
    open.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('no handler'));
    fireEvent.press(await screen.findByText('Text Dee'));
    change('background');
    change('active');
    fireEvent.press(await screen.findByText(PROMPT));
    expect(await screen.findByText('Text Eli')).toBeTruthy();
    expect(screen.queryByText('Done')).toBeNull();
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
    change('background');
    change('active');
    expect(focus.mock.calls.length).toBe(before);
    await screen.findByText(PROMPT);
    expect(focus.mock.calls.length).toBe(before + 1);
    expect(screen.getByRole('button', { name: PROMPT }).props.accessibilityHint).toBe('Marks Dee sent and opens Messages for Eli');
    fireEvent.press(screen.getByText('Not yet'));
    expect(focus.mock.calls.length).toBe(before + 2);
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
