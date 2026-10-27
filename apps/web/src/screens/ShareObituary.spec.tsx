import { render, screen } from '@testing-library/react';
import { ShareObituary } from './ShareObituary';

const session = {
  personName: 'Margaret',
  dateOfPassing: '',
  senderName: '',
  obituaryUrl: '',
  obituaryPublisher: '',
} as unknown as Parameters<typeof ShareObituary>[0]['session'];

describe('ShareObituary (web)', () => {
  // Peter, 2026-10-26: drafting is off and there is no AI service yet, so the card is hidden
  // until the template draft (#358) ships.
  it('hides "Not written yet?" while drafting is off', () => {
    render(
      <ShareObituary session={session} onBack={vi.fn()} onChange={vi.fn()} onContinue={vi.fn()} onDraft={vi.fn()} />,
    );
    expect(screen.getByRole('heading', { name: 'Has the obituary been published?' })).toBeInTheDocument();
    expect(screen.queryByText('Not written yet?')).not.toBeInTheDocument();
    expect(screen.queryByText('in beta')).not.toBeInTheDocument();
  });
});
