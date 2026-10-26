import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Review } from './Review';
import type { ReviewCopy, ReviewProps } from './Review';

const copy: ReviewCopy = {
  heading: 'Review your message',
  headingAnnouncement: 'Read it once before it goes',
  back: 'Back',
  announcementTag: 'Announcement',
  messageLabel: 'Your message',
  edit: 'Edit wording',
  doneEditing: 'Done editing',
  softer: 'Softer tone',
  toneKept: 'Your own words are kept. Undo your edit to change the tone.',
  useSuggested: 'Use the suggested wording',
  checklist: "What you'll need",
  blank: 'Add a message before you send it.',
  noRecipients: 'Choose who should get this message first.',
  privacy: "You'll text each person from your own number, one at a time.",
};

const base = {
  copy,
  kind: 'announcement' as const,
  intro: 'This will go to 2 people as a text message.',
  sendLabel: 'Text 2 people',
  tone: 'plain',
  hasRecipients: true,
};

/** Holds the message, tone and edited flag the way the app does, so typing and switching change what is shown. */
function Harness({ onToneChange, onUseSuggested, ...over }: Partial<ReviewProps> = {}) {
  const [message, setMessage] = useState('Margaret Hayes has passed away.');
  const [edited, setEdited] = useState(false);
  const [tone, setTone] = useState('plain');
  return (
    <Review
      {...base}
      message={message}
      edited={edited}
      onMessageChange={(next) => {
        setMessage(next);
        setEdited(true);
      }}
      onUseSuggested={() => {
        onUseSuggested?.();
        setMessage('Margaret Hayes has passed away.');
        setEdited(false);
      }}
      tone={tone}
      onToneChange={(next) => {
        onToneChange?.(next);
        setTone(next);
      }}
      onBack={vi.fn()}
      onSend={vi.fn()}
      {...over}
    />
  );
}

describe('Review', () => {
  it('reads "Read it once before it goes" for an announcement, with the tag, intro and preview', () => {
    render(<Harness />);
    expect(screen.getByRole('heading', { level: 1, name: 'Read it once before it goes' })).toBeInTheDocument();
    expect(screen.getByText('Announcement')).toBeInTheDocument();
    expect(screen.getByText('This will go to 2 people as a text message.')).toBeInTheDocument();
    expect(screen.getByText('Margaret Hayes has passed away.')).toBeInTheDocument();
    expect(screen.getByText("You'll text each person from your own number, one at a time.")).toBeInTheDocument();
  });

  it('reads "Review your message" for anything else, without the tag or the editing buttons', () => {
    render(<Harness kind="service" />);
    expect(screen.getByRole('heading', { level: 1, name: 'Review your message' })).toBeInTheDocument();
    expect(screen.queryByText('Announcement')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit wording' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Softer tone' })).not.toBeInTheDocument();
  });

  it('shows the field after Edit wording and hides it after Done editing', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    expect(screen.queryByLabelText('Your message')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Edit wording' }));
    const field = screen.getByLabelText('Your message');
    expect(field).toHaveValue('Margaret Hayes has passed away.');
    expect(field).toHaveFocus();
    await user.type(field, ' Thank you.');
    await user.click(screen.getByRole('button', { name: 'Done editing' }));
    expect(screen.queryByLabelText('Your message')).not.toBeInTheDocument();
    expect(screen.getByText('Margaret Hayes has passed away. Thank you.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit wording' })).toHaveFocus();
  });

  it('names the field by its visible label', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Edit wording' }));
    const label = screen.getByText('Your message');
    expect(label.closest('[aria-hidden="true"]')).toBeNull();
    expect(screen.getByRole('textbox', { name: 'Your message' })).toHaveAttribute('aria-labelledby', label.closest('[id]')?.id);
  });

  it('switches tone with a constant label and a pressed state', async () => {
    const user = userEvent.setup();
    const onToneChange = vi.fn();
    render(<Harness onToneChange={onToneChange} />);
    const softer = screen.getByRole('button', { name: 'Softer tone' });
    expect(softer).toHaveAttribute('aria-pressed', 'false');
    await user.click(softer);
    expect(onToneChange).toHaveBeenCalledWith('softer');
    expect(screen.getByRole('button', { name: 'Softer tone' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: 'Softer tone' }));
    expect(onToneChange).toHaveBeenLastCalledWith('plain');
  });

  it('keeps edited words: the tone button is unavailable and says why, until the suggested wording is back', async () => {
    const user = userEvent.setup();
    const onToneChange = vi.fn();
    render(<Harness onToneChange={onToneChange} />);
    expect(screen.queryByRole('button', { name: 'Use the suggested wording' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Edit wording' }));
    await user.type(screen.getByLabelText('Your message'), ' Thank you.');
    await user.click(screen.getByRole('button', { name: 'Done editing' }));
    const softer = screen.getByRole('button', { name: 'Softer tone' });
    expect(softer).toHaveAttribute('aria-disabled', 'true');
    expect(softer).toHaveAccessibleDescription('Your own words are kept. Undo your edit to change the tone.');
    await user.click(softer);
    expect(onToneChange).not.toHaveBeenCalled();
    expect(screen.getByText('Margaret Hayes has passed away. Thank you.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Use the suggested wording' }));
    expect(screen.getByText('Margaret Hayes has passed away.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Use the suggested wording' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Softer tone' })).not.toHaveAttribute('aria-disabled', 'true');
    await user.click(screen.getByRole('button', { name: 'Softer tone' }));
    expect(onToneChange).toHaveBeenCalledWith('softer');
  });

  it('opens What you will need only when the app offers it', async () => {
    const user = userEvent.setup();
    const onWhatYoullNeed = vi.fn();
    const { unmount } = render(<Harness onWhatYoullNeed={onWhatYoullNeed} />);
    await user.click(screen.getByRole('button', { name: "What you'll need" }));
    expect(onWhatYoullNeed).toHaveBeenCalledOnce();
    unmount();
    render(<Harness />);
    expect(screen.queryByRole('button', { name: "What you'll need" })).not.toBeInTheDocument();
  });

  it('shows the send label and sends', async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();
    render(<Harness onSend={onSend} />);
    await user.click(screen.getByRole('button', { name: 'Text 2 people' }));
    expect(onSend).toHaveBeenCalledOnce();
  });

  it('blocks a blank message and says why', async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();
    render(<Harness onSend={onSend} />);
    // The status nodes are there before there is anything to say, so a change is announced.
    expect(screen.getAllByRole('status').length).toBeGreaterThan(0);
    await user.click(screen.getByRole('button', { name: 'Edit wording' }));
    await user.clear(screen.getByLabelText('Your message'));
    const send = screen.getByRole('button', { name: 'Text 2 people' });
    expect(send).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByText('Add a message before you send it.')).toBeInTheDocument();
    expect(send).toHaveAccessibleDescription('Add a message before you send it.');
    await user.click(send);
    expect(onSend).not.toHaveBeenCalled();
    await user.type(screen.getByLabelText('Your message'), 'Hello');
    expect(send).not.toHaveAttribute('aria-disabled', 'true');
    expect(send).not.toHaveAttribute('aria-describedby');
  });

  it('blocks sending to no one and says why', async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();
    render(<Harness hasRecipients={false} onSend={onSend} />);
    const send = screen.getByRole('button', { name: 'Text 2 people' });
    expect(screen.getByText('Choose who should get this message first.')).toBeInTheDocument();
    await user.click(send);
    expect(onSend).not.toHaveBeenCalled();
  });

  it('answers Back', async () => {
    const user = userEvent.setup();
    const onBack = vi.fn();
    render(<Harness onBack={onBack} />);
    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(onBack).toHaveBeenCalledOnce();
  });
});
