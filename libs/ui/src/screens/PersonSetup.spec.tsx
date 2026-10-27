import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PersonSetup } from './PersonSetup';
import type { PersonSetupCopy, PersonSetupProps } from './PersonSetup';

const copy: PersonSetupCopy = {
  heading: 'Who are we writing about?',
  headingEdit: 'Edit their details',
  intro: "We'll carry this into every message, so you only type it once.",
  back: 'Back',
  checklist: "What you'll need",
  nameLabel: 'Their name',
  nameAccessible: 'Their name, required',
  namePlaceholder: 'e.g. Margaret Hayes',
  dateLabel: 'Date they passed',
  optional: '(optional)',
  senderLabel: 'Your name',
  senderPlaceholder: 'So people know who wrote',
  continue: 'Continue',
  needName: 'Type their name to continue.',
};

function Harness({ start, onNameChange, ...over }: Partial<PersonSetupProps> & { start?: string }) {
  const [name, setName] = useState(start ?? '');
  return (
    <PersonSetup
      copy={copy}
      renderDate={({ labelId, accessibleName }) => <input type="text" aria-labelledby={labelId} data-name={accessibleName} />}
      onBack={() => undefined}
      onWhatYoullNeed={() => undefined}
      onContinue={() => undefined}
      {...over}
      name={name}
      onNameChange={(value) => {
        setName(value);
        onNameChange?.(value);
      }}
    />
  );
}

function setup(over: Partial<PersonSetupProps> & { start?: string } = {}) {
  const handlers = { onBack: vi.fn(), onWhatYoullNeed: vi.fn(), onContinue: vi.fn() };
  render(<Harness {...handlers} {...over} />);
  return handlers;
}

const continueButton = () => screen.getByRole('button', { name: 'Continue' });

describe('PersonSetup', () => {
  it('has one h1, the intro, and fields named by their visible labels', () => {
    setup({ sender: '', onSenderChange: vi.fn() });
    expect(screen.getByRole('heading', { level: 1, name: 'Who are we writing about?' })).toBeInTheDocument();
    expect(screen.getByText("We'll carry this into every message, so you only type it once.")).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Their name' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Date they passed (optional)' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Your name (optional)' })).toBeInTheDocument();
  });

  it('shows the edit heading when editing', () => {
    setup({ editing: true });
    expect(screen.getByRole('heading', { level: 1, name: 'Edit their details' })).toBeInTheDocument();
  });

  it('leaves out the sender field when the app does not ask for it', () => {
    setup();
    expect(screen.queryByRole('textbox', { name: /Your name/ })).not.toBeInTheDocument();
  });

  it('gives the date slot the label id and the name a screen reader should read', () => {
    setup();
    expect(screen.getByRole('textbox', { name: 'Date they passed (optional)' })).toHaveAttribute('data-name', 'Date they passed (optional)');
  });

  it('answers Back and What you will need', async () => {
    const user = userEvent.setup();
    const h = setup();
    await user.click(screen.getByRole('button', { name: 'Back' }));
    await user.click(screen.getByRole('button', { name: "What you'll need" }));
    expect(h.onBack).toHaveBeenCalledOnce();
    expect(h.onWhatYoullNeed).toHaveBeenCalledOnce();
  });

  it('blocks Continue with a reason until a name is typed, and does not fire', async () => {
    const user = userEvent.setup();
    const h = setup();
    expect(continueButton()).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByText('Type their name to continue.')).toBeInTheDocument();
    expect(continueButton()).toHaveAccessibleDescription('Type their name to continue.');
    await user.click(continueButton());
    expect(h.onContinue).not.toHaveBeenCalled();
  });

  it('treats a name of only spaces as missing', () => {
    setup({ start: '   ' });
    expect(continueButton()).toHaveAttribute('aria-disabled', 'true');
  });

  it('reports typing, then Continue fires once a name is set', async () => {
    const user = userEvent.setup();
    const onNameChange = vi.fn();
    const h = setup({ onNameChange });
    await user.type(screen.getByRole('textbox', { name: 'Their name' }), 'Al');
    expect(onNameChange).toHaveBeenLastCalledWith('Al');
    expect(continueButton()).not.toHaveAttribute('aria-disabled', 'true');
    expect(screen.queryByText('Type their name to continue.')).not.toBeInTheDocument();
    await user.click(continueButton());
    expect(h.onContinue).toHaveBeenCalledOnce();
  });

  it('reports typing in the sender field', async () => {
    const user = userEvent.setup();
    const onSenderChange = vi.fn();
    setup({ sender: '', onSenderChange });
    await user.type(screen.getByRole('textbox', { name: 'Your name (optional)' }), 'P');
    expect(onSenderChange).toHaveBeenCalledWith('P');
  });
});
