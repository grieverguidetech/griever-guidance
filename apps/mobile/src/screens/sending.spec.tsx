import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { useEffect } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { AppState, Linking } from 'react-native';
import { freshDraft, useSendFlow } from '@griever/hooks';
import type { SessionDetails } from '@griever/shared';
import { SendingScreen } from './SendingScreen';

const session = { personName: 'Margaret Hayes', dateOfPassing: '', senderName: 'Peter', obituaryUrl: '', obituaryPublisher: '', serviceDate: '' } as SessionDetails;
const all = [
  { contactId: 'c1', name: 'Dee', phone: '+15555550100' },
  { contactId: 'c2', name: 'Eli', phone: '+15555550101' },
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
  let listener: (state: string) => void = () => undefined;
  jest.spyOn(AppState, 'addEventListener').mockImplementation(((_: string, cb: (state: string) => void) => {
    listener = cb;
    return { remove: jest.fn() };
  }) as never);
  render(<Harness ids={ids} />);
  const change = (state: string) => act(() => listener(state));
  return { open, change };
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

  it('also asks after inactive then active', async () => {
    const { change } = setup(['c1', 'c2']);
    fireEvent.press(await screen.findByText('Text Dee'));
    change('inactive');
    change('active');
    expect(await screen.findByText(PROMPT)).toBeTruthy();
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

  it('shows Done on the last person and opens nothing more', async () => {
    const { open, change } = setup(['c1']);
    fireEvent.press(await screen.findByText('Text Dee'));
    change('background');
    change('active');
    expect(await screen.findByText('Sent to Dee? Done')).toBeTruthy();
    fireEvent.press(screen.getByText('Sent to Dee? Done'));
    expect(open).toHaveBeenCalledTimes(1);
  });
});
