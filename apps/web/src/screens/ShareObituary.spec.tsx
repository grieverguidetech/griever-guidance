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

  it('shows no mobile-only Step 2 heading', () => {
    render(<ShareObituary session={session} onBack={vi.fn()} onChange={vi.fn()} onContinue={vi.fn()} onDraft={vi.fn()} />);
    expect(screen.queryByRole('heading', { name: /Step 2/ })).toBeNull();
  });
});

describe('ShareObituary (web) is unchanged by the mobile obituary steps (#655)', () => {
  it('shows no mobile-only controls or lines', () => {
    render(<ShareObituary session={session} onBack={vi.fn()} onChange={vi.fn()} onContinue={vi.fn()} onDraft={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Paste link' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Copy the text' })).toBeNull();
    expect(screen.queryByText(/Step 1|Step 2/)).toBeNull();
    expect(screen.queryByText('Share the obituary')).toBeNull();
    expect(screen.getByRole('heading', { name: 'Has the obituary been published?' })).toBeInTheDocument();
    expect(screen.getByText('Choose who to send it to')).toBeInTheDocument();
  });
});
