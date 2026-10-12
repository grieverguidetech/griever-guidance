import { useEffect } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { freshDraft, useSendFlow } from '@griever/hooks';
import type { Contact, SessionDetails } from '@griever/shared';
import { SendingScreen } from './SendingScreen';

const session = {
  personName: 'Margaret Hayes',
  dateOfPassing: 'May 29, 2026',
  senderName: 'Peter',
  obituaryUrl: '',
  obituaryPublisher: '',
  serviceDate: '',
} as SessionDetails;

const PHONES = ['+16175550101', '+16175550102', '+16175550103'];
const CONTACTS: Contact[] = PHONES.map((phone, i) => ({
  contactId: `c${i}`,
  name: ['Aunt Carol', 'Bob Smith', 'Dana Lee'][i],
  phone,
  email: null,
  tier: 'family',
  source: 'manual',
  createdAt: 1,
}));

/** The real send flow, started with all three people chosen. */
function Harness() {
  const flow = useSendFlow({
    session,
    draft: freshDraft({ templateCategory: 'announcement', step: 'announce' }),
  });
  const { selectContacts, startSendJob } = flow;
  useEffect(() => {
    selectContacts(CONTACTS.map((c) => c.contactId));
  }, [selectContacts]);
  useEffect(() => {
    if (flow.selectedContactIds.length === 3 && !flow.sendJob) startSendJob();
  }, [flow.selectedContactIds, flow.sendJob, startSendJob]);
  return <SendingScreen flow={flow} contacts={CONTACTS} />;
}

describe('SendingScreen hands off one person at a time (C1)', () => {
  const assigned: string[] = [];

  beforeEach(() => {
    assigned.length = 0;
    // jsdom cannot navigate; record where the app asked to go instead.
    vi.stubGlobal('location', {
      set href(value: string) {
        assigned.push(value);
      },
      get href() {
        return assigned.at(-1) ?? 'http://localhost/';
      },
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('opens an sms: link for exactly one number, then the next person on Next', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(await screen.findByRole('button', { name: 'Open Messages' }));
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(await screen.findByRole('button', { name: 'Open Messages' }));

    expect(assigned).toHaveLength(2);
    for (const [i, link] of assigned.entries()) {
      expect(link.startsWith('sms:')).toBe(true);
      const recipients = link.slice('sms:'.length).split(/[?&]body=/)[0];
      expect(recipients).toBe(PHONES[i]);
    }
    // The message, not the other people's numbers, is all that travels with it.
    for (const link of assigned) {
      for (const other of PHONES) {
        if (!link.startsWith(`sms:${other}`)) expect(decodeURIComponent(link)).not.toContain(other);
      }
    }
  });

  it('names only the person it is on, and offers Done on the last one', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    expect(await screen.findByText('Aunt Carol')).toBeInTheDocument();
    expect(screen.getByText('1 of 3')).toBeInTheDocument();
    for (const expected of ['Bob Smith', 'Dana Lee']) {
      await user.click(screen.getByRole('button', { name: 'Open Messages' }));
      await user.click(screen.getByRole('button', { name: 'Next' }));
      expect(await screen.findByText(expected)).toBeInTheDocument();
    }
    await user.click(screen.getByRole('button', { name: 'Open Messages' }));
    expect(screen.getByRole('button', { name: 'Done' })).toBeInTheDocument();
  });
});
