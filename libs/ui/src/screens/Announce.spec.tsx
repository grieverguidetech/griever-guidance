import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Announce } from './Announce';
import type { AnnounceCopy, AnnounceProps } from './Announce';

const copy: AnnounceCopy = {
  heading: 'Announce the passing',
  intro: "We have everything we need. This is only if you'd like to say more.",
  back: 'Back',
  checklist: "What you'll need",
  kicker: 'From your details',
  edit: 'Edit',
  noteLabel: "Anything you'd like to add",
  optional: '(optional)',
  placeholder: 'She was peaceful, and we were with her.',
  continue: 'Continue',
};

function setup(over: Partial<AnnounceProps> = {}) {
  const handlers = {
    onBack: vi.fn(),
    onWhatYoullNeed: vi.fn(),
    onEdit: vi.fn(),
    onNoteChange: vi.fn(),
    onContinue: vi.fn(),
  };
  render(
    <Announce
      copy={copy}
      eyebrow="For Margaret"
      recap="Margaret Hayes · passed May 29, 2026 · from Peter"
      note=""
      {...handlers}
      {...over}
    />,
  );
  return handlers;
}

describe('Announce', () => {
  it('has one h1, the eyebrow, the intro and the recap', () => {
    setup();
    expect(screen.getByRole('heading', { level: 1, name: 'Announce the passing' })).toBeInTheDocument();
    expect(screen.getByText('For Margaret')).toBeInTheDocument();
    expect(screen.getByText("We have everything we need. This is only if you'd like to say more.")).toBeInTheDocument();
    expect(screen.getByText('From your details')).toBeInTheDocument();
    expect(screen.getByText('Margaret Hayes · passed May 29, 2026 · from Peter')).toBeInTheDocument();
  });

  it('answers Back, What you will need, Edit and Continue', async () => {
    const user = userEvent.setup();
    const h = setup();
    await user.click(screen.getByRole('button', { name: 'Back' }));
    await user.click(screen.getByRole('button', { name: "What you'll need" }));
    await user.click(screen.getByRole('button', { name: 'Edit' }));
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(h.onBack).toHaveBeenCalledOnce();
    expect(h.onWhatYoullNeed).toHaveBeenCalledOnce();
    expect(h.onEdit).toHaveBeenCalledOnce();
    expect(h.onContinue).toHaveBeenCalledOnce();
  });

  it('labels the optional note and shows what was saved', () => {
    setup({ note: 'She was peaceful.' });
    expect(screen.getByLabelText("Anything you'd like to add (optional)")).toHaveValue('She was peaceful.');
  });

  it('reports what is typed in the note', async () => {
    const user = userEvent.setup();
    const h = setup();
    await user.type(screen.getByLabelText(/Anything you'd like to add/), 'T');
    expect(h.onNoteChange).toHaveBeenCalledWith('T');
  });

  it('names the note field by its visible label, with (optional) as its own lighter text', () => {
    setup();
    const field = screen.getByRole('textbox', { name: "Anything you'd like to add (optional)" });
    const label = screen.getByText("Anything you'd like to add");
    expect(label.closest('[aria-hidden="true"]')).toBeNull();
    expect(field).toHaveAttribute('aria-labelledby', label.closest('[id]')?.id);
    expect(getComputedStyle(screen.getByText('(optional)')).color).toBe('rgb(96, 93, 93)');
  });

  it('draws the eyebrow in the second accent when asked', () => {
    setup({ eyebrowTone: 'accent2' });
    expect(getComputedStyle(screen.getByText('For Margaret')).color).toBe('rgb(170, 11, 86)');
  });
});
