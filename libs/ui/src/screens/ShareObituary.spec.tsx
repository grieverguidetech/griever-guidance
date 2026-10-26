import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ShareObituary } from './ShareObituary';
import type { ShareObituaryCopy, ShareObituaryProps } from './ShareObituary';

const copy: ShareObituaryCopy = {
  heading: 'Has the obituary been published?',
  intro: "Once it's up, this is how most people will learn about the service.",
  back: 'Back',
  checklist: "What you'll need",
  linkLabel: 'Link to the obituary',
  linkPlaceholder: 'Paste the link from the paper or funeral home',
  publisherLabel: 'Where it was published',
  optional: '(optional)',
  publisherPlaceholder: 'e.g. The Waltham Register',
  previewKicker: "We'll send",
  continue: 'Choose who to send it to',
  needLink: 'Paste the link to the obituary to continue.',
  invalidLink: "That link doesn't look right. Copy it again from the paper or funeral home.",
  waiting: "Not published yet? We'll wait.",
  draftTitle: 'Not written yet?',
  draftBody: 'We can help you draft it.',
  draftButton: 'Help me write it',
};

function setup(over: Partial<ShareObituaryProps> = {}) {
  const handlers = {
    onBack: vi.fn(),
    onWhatYoullNeed: vi.fn(),
    onLinkChange: vi.fn(),
    onPublisherChange: vi.fn(),
    onContinue: vi.fn(),
  };
  render(
    <ShareObituary
      copy={copy}
      eyebrow="For Margaret"
      eyebrowTone="accent2"
      link=""
      linkValid={false}
      publisher=""
      {...handlers}
      {...over}
    />,
  );
  return handlers;
}

const continueButton = () => screen.getByRole('button', { name: 'Choose who to send it to' });

describe('ShareObituary', () => {
  it('has one h1 and a link field named by its visible label', () => {
    setup();
    expect(screen.getByRole('heading', { level: 1, name: 'Has the obituary been published?' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Link to the obituary' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Where it was published (optional)' })).toBeInTheDocument();
  });

  it('answers Back and What you will need', async () => {
    const user = userEvent.setup();
    const h = setup();
    await user.click(screen.getByRole('button', { name: 'Back' }));
    await user.click(screen.getByRole('button', { name: "What you'll need" }));
    expect(h.onBack).toHaveBeenCalledOnce();
    expect(h.onWhatYoullNeed).toHaveBeenCalledOnce();
  });

  it('reports what is typed in the link and publisher fields', async () => {
    const user = userEvent.setup();
    const h = setup();
    await user.type(screen.getByRole('textbox', { name: 'Link to the obituary' }), 'x');
    await user.type(screen.getByRole('textbox', { name: /Where it was published/ }), 'y');
    expect(h.onLinkChange).toHaveBeenCalledWith('x');
    expect(h.onPublisherChange).toHaveBeenCalledWith('y');
  });

  it('with no link, Continue is unavailable, says why, and does nothing', async () => {
    const user = userEvent.setup();
    const h = setup();
    expect(continueButton()).toHaveAttribute('aria-disabled', 'true');
    expect(continueButton()).toHaveAccessibleDescription('Paste the link to the obituary to continue.');
    await user.click(continueButton());
    expect(h.onContinue).not.toHaveBeenCalled();
    expect(screen.getByRole('textbox', { name: 'Link to the obituary' })).not.toBeInvalid();
  });

  it('a bad link shows the error once the field is left, and Continue stays blocked with that reason', async () => {
    const user = userEvent.setup();
    const h = setup({ link: 'has space', linkValid: false });
    const field = screen.getByRole('textbox', { name: 'Link to the obituary' });
    expect(field).not.toBeInvalid();
    await user.click(field);
    await user.tab();
    expect(field).toBeInvalid();
    expect(field).toHaveAccessibleDescription(copy.invalidLink);
    expect(continueButton()).toHaveAttribute('aria-disabled', 'true');
    expect(continueButton()).toHaveAccessibleDescription(copy.invalidLink);
    await user.click(continueButton());
    expect(h.onContinue).not.toHaveBeenCalled();
  });

  it('pressing Continue with a bad link shows the error without leaving the field', async () => {
    const user = userEvent.setup();
    setup({ link: 'has space', linkValid: false });
    await user.click(continueButton());
    expect(screen.getByRole('textbox', { name: 'Link to the obituary' })).toBeInvalid();
    expect(screen.getByText(copy.invalidLink)).toBeInTheDocument();
  });

  it('a good link enables Continue, shows the preview, and Continue fires', async () => {
    const user = userEvent.setup();
    const h = setup({ link: 'https://example.com/obit', linkValid: true, preview: 'Margaret’s obituary has been published.' });
    expect(continueButton()).not.toHaveAttribute('aria-disabled');
    expect(screen.getByText("We'll send")).toBeInTheDocument();
    expect(screen.getByText('Margaret’s obituary has been published.')).toBeInTheDocument();
    await user.click(continueButton());
    expect(h.onContinue).toHaveBeenCalledOnce();
  });

  it('shows "Not written yet?" only when a draft handler is passed', async () => {
    const user = userEvent.setup();
    setup();
    expect(screen.queryByText('Not written yet?')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Help me write it' })).not.toBeInTheDocument();
    const onDraft = vi.fn();
    render(
      <ShareObituary copy={copy} eyebrow="x" link="" linkValid={false} publisher="" onLinkChange={vi.fn()} onPublisherChange={vi.fn()} onBack={vi.fn()} onWhatYoullNeed={vi.fn()} onContinue={vi.fn()} onDraft={onDraft} />,
    );
    expect(screen.getByText('Not written yet?')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Help me write it' }));
    expect(onDraft).toHaveBeenCalledOnce();
  });

  it('a draft button marked unavailable says why and does nothing', async () => {
    const user = userEvent.setup();
    const onDraft = vi.fn();
    setup({ onDraft, draftUnavailable: 'in beta' });
    const button = screen.getByRole('button', { name: 'Help me write it' });
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(button).toHaveAccessibleDescription('in beta');
    await user.click(button);
    expect(onDraft).not.toHaveBeenCalled();
  });

  it('draws the eyebrow in the second accent when asked', () => {
    setup();
    expect(getComputedStyle(screen.getByText('For Margaret')).color).toBe('rgb(170, 11, 86)');
  });
});
