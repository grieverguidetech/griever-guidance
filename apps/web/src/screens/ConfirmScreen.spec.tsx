import { useEffect } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { freshDraft, useSendFlow } from '@griever/hooks';
import { SHARE_SERVICE_SAMPLE } from '@griever/shared';
import type { Contact, SessionDetails } from '@griever/shared';
import { ConfirmScreen } from './ConfirmScreen';
import { SendingScreen } from './SendingScreen';

const session = {
  personName: 'Margaret Hayes',
  dateOfPassing: 'May 29, 2026',
  senderName: 'Peter',
  obituaryUrl: '',
  obituaryPublisher: '',
  serviceDate: '',
} as SessionDetails;

const CONTACTS: Contact[] = [
  { contactId: 'c0', name: 'Aunt Carol', phone: '+16175550101', email: null, tier: 'family', source: 'manual', createdAt: 1 },
];

/** The real flow on "Review your message" for Share the service, then on to sending. */
function Harness() {
  const flow = useSendFlow({
    session,
    draft: freshDraft({
      templateCategory: 'service',
      templateOverrideId: 'share-service',
      step: 'review',
      fields: { serviceDate: 'June 14', serviceTime: '2:00 PM', serviceLocation: 'Oak Chapel' },
    }),
  });
  const { selectContacts } = flow;
  useEffect(() => {
    selectContacts(['c0']);
  }, [selectContacts]);
  return flow.sendJob ? <SendingScreen flow={flow} contacts={CONTACTS} /> : <ConfirmScreen flow={flow} />;
}

describe('Review your message (Share the service)', () => {
  const assigned: string[] = [];
  beforeEach(() => {
    assigned.length = 0;
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

  it('has a labelled text field holding the message', () => {
    render(<Harness />);
    expect(screen.getByLabelText('Your message')).toHaveValue(
      "Margaret Hayes' service will be held June 14 at 2:00 PM, Oak Chapel.",
    );
  });

  it('sends the edited text in the sms: link', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const box = screen.getByLabelText('Your message');
    await user.clear(box);
    await user.type(box, 'Come as you are, 2 PM at Oak Chapel.');
    await user.click(screen.getByRole('button', { name: 'Text these people' }));
    await user.click(await screen.findByRole('button', { name: 'Open Messages' }));
    expect(assigned).toHaveLength(1);
    expect(decodeURIComponent(assigned[0])).toContain('body=Come as you are, 2 PM at Oak Chapel.');
  });

  it('opens and closes the sample, with aria-expanded and a 44 px target', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const toggle = screen.getByRole('button', { name: 'See a sample message' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveStyle({ minHeight: '44px', minWidth: '44px' });
    expect(screen.queryByText(SHARE_SERVICE_SAMPLE)).not.toBeInTheDocument();
    await user.click(toggle);
    expect(screen.getByRole('button', { name: 'Hide a sample message' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText(SHARE_SERVICE_SAMPLE)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Hide a sample message' }));
    expect(screen.queryByText(SHARE_SERVICE_SAMPLE)).not.toBeInTheDocument();
  });
});
