import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Session } from '@griever/hooks';
import { PathLanding } from './PathLanding';

const session: Session = {
  id: 's1',
  createdAt: '2026-05-30T00:00:00.000Z',
  lastOpenedAt: '2026-05-30T00:00:00.000Z',
  personName: 'Margaret Hale',
  dateOfPassing: '2026-05-29',
  senderName: 'Anna',
  obituaryUrl: '',
  drafts: {},
  serviceReady: false,
  recipientsNotified: { announcement: ['contact-id-1'] },
  momentCompletedAt: { announce: '2026-05-30T00:00:00.000Z' },
  remindersScheduled: [],
};

describe('PathLanding share', () => {
  afterEach(() => {
    Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
  });

  it('shares the checklist in the real order, without contacts (C10, C3)', async () => {
    const user = userEvent.setup();
    const share = vi.fn(async (_data: { text: string }) => undefined);
    Object.defineProperty(navigator, 'share', { value: share, configurable: true });
    render(
      <PathLanding
        session={session}
        onBack={vi.fn()}
        onStartMoment={vi.fn()}
        onWhatYoullNeed={vi.fn()}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Share these details' }));
    const { text } = share.mock.calls[0][0];
    const order = ['Announce the passing', 'Share the service', 'Share the obituary', 'Send thank-yous'].map(
      (label) => text.indexOf(label),
    );
    expect(order.every((i) => i >= 0)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(text).toContain('- Done: Announce the passing');
    expect(text).not.toContain('contact-id-1');
  });
});

describe('PathLanding Home link (#112)', () => {
  it('has a Back control, and no other-people list or "Someone else I\'ve lost"', async () => {
    const user = userEvent.setup();
    const onBack = vi.fn();
    render(<PathLanding session={session} onBack={onBack} onStartMoment={vi.fn()} onWhatYoullNeed={vi.fn()} />);
    expect(screen.queryByText("Other people you're writing about")).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: "Someone else I've lost" })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(onBack).toHaveBeenCalledOnce();
  });
});
