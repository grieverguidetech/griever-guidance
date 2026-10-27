import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WhoShouldKnow } from './WhoShouldKnow';
import type { WhoShouldKnowCopy, WhoShouldKnowProps } from './WhoShouldKnow';

const copy: WhoShouldKnowCopy = {
  heading: 'Who should know?',
  introGrouped: "Send to close family now, everyone else when you're ready.",
  introUngrouped: 'Select everyone who should get this.',
  back: 'Back',
  checklist: "What you'll need",
  tierFirst: 'Close family',
  tierFamily: 'Friends & family',
  selectAll: 'Select all',
  selectAllFor: 'Select all, {group}',
  chooseOne: 'Choose at least one person',
  fillBoth: 'Enter a name and a mobile number',
  addAnother: 'Add another person',
  nameLabel: 'Name',
  namePlaceholder: 'e.g. Aunt Carol',
  phoneLabel: 'Mobile number',
  phonePlaceholder: '(617) 555-0148',
  add: 'Add',
  cancel: 'Cancel',
  badNumber: "That number doesn't look right — check the area code and digits.",
  continue: 'Continue',
  empty: 'No one saved yet. Add someone below.',
  bringAcross: 'Add from your contacts',
};

const people = [
  { id: 'a', name: 'Aunt Carol', phone: '(617) 555-0148', tier: 'first' as const },
  { id: 'b', name: 'Bob Smith', phone: '(617) 555-0149', tier: 'family' as const },
  { id: 'c', name: 'Cat Jones', phone: '(617) 555-0150', tier: 'family' as const },
];

function setup(over: Partial<WhoShouldKnowProps> = {}) {
  const handlers = {
    onBack: vi.fn(),
    onToggle: vi.fn(),
    onSelectAll: vi.fn(),
    onContinue: vi.fn(),
    onAddPerson: vi.fn(async () => undefined),
    toE164: vi.fn((raw: string) => (raw.replace(/\D/g, '').length >= 10 ? '+16175550148' : null)),
  };
  const count = (over.selectedIds ?? []).length;
  render(
    <WhoShouldKnow copy={copy} people={people} grouped selectedIds={[]} selectedLabel={`${count} selected`} {...handlers} {...over} />,
  );
  return handlers;
}

describe('WhoShouldKnow', () => {
  it('has one h1 and the grouped intro, with a heading for each tier', () => {
    setup();
    expect(screen.getByRole('heading', { level: 1, name: 'Who should know?' })).toBeInTheDocument();
    expect(screen.getByText("Send to close family now, everyone else when you're ready.")).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Close family' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Friends & family' })).toBeInTheDocument();
  });

  it('shows each person as a checkbox that reads checked or not, and reports a toggle', async () => {
    const user = userEvent.setup();
    const h = setup({ selectedIds: ['b'] });
    expect(screen.getAllByRole('checkbox')).toHaveLength(3);
    expect(screen.getByRole('checkbox', { name: /Bob Smith/ })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /Aunt Carol/ })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: /Aunt Carol/ })).toHaveAccessibleName(/\(617\) 555-0148/);
    await user.click(screen.getByRole('checkbox', { name: /Aunt Carol/ }));
    expect(h.onToggle).toHaveBeenCalledWith('a');
  });

  it('selects the whole group with its Select all, and offers none when not grouped', async () => {
    const user = userEvent.setup();
    const h = setup();
    const closeFamily = screen.getByRole('button', { name: 'Select all, Close family' });
    const friends = screen.getByRole('button', { name: 'Select all, Friends & family' });
    await user.click(friends);
    expect(h.onSelectAll).toHaveBeenLastCalledWith(['b', 'c']);
    await user.click(closeFamily);
    expect(h.onSelectAll).toHaveBeenLastCalledWith(['a']);
  });

  it('shows a plain list with the other intro and no Select all when not grouped', () => {
    setup({ grouped: false });
    expect(screen.getByText('Select everyone who should get this.')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 2 })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Select all' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('checkbox')).toHaveLength(3);
  });

  it('adds a person by hand, and shows the error for a number that does not look right', async () => {
    const user = userEvent.setup();
    const h = setup();
    await user.click(screen.getByRole('button', { name: 'Add another person' }));
    await user.type(screen.getByLabelText('Name'), 'Aunt Dee');
    await user.type(screen.getByLabelText('Mobile number'), '123');
    await user.click(screen.getByRole('button', { name: 'Add' }));
    expect(screen.getByText("That number doesn't look right — check the area code and digits.")).toBeInTheDocument();
    expect(h.onAddPerson).not.toHaveBeenCalled();

    await user.clear(screen.getByLabelText('Mobile number'));
    expect(screen.queryByText(/doesn't look right/)).not.toBeInTheDocument();
    await user.type(screen.getByLabelText('Mobile number'), '617 555 0148');
    await user.click(screen.getByRole('button', { name: 'Add' }));
    expect(h.onAddPerson).toHaveBeenCalledWith({ name: 'Aunt Dee', phone: '+16175550148' });
    expect(await screen.findByRole('button', { name: 'Add another person' })).toBeInTheDocument();
  });

  it('keeps Add unavailable until both fields have something, and Cancel closes the form', async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole('button', { name: 'Add another person' }));
    expect(screen.getByRole('button', { name: 'Add' })).toHaveAttribute('aria-disabled', 'true');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByLabelText('Name')).not.toBeInTheDocument();
  });

  it('counts the chosen people and answers Back and Continue', async () => {
    const user = userEvent.setup();
    const h = setup({ selectedIds: ['a', 'b'] });
    expect(screen.getByText('2 selected')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Back' }));
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(h.onBack).toHaveBeenCalledOnce();
    expect(h.onContinue).toHaveBeenCalledOnce();
  });

  it('does not continue until someone is chosen', async () => {
    const user = userEvent.setup();
    const h = setup();
    expect(screen.getByText('0 selected')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue' })).toHaveAttribute('aria-disabled', 'true');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(h.onContinue).not.toHaveBeenCalled();
  });

  it('puts the reason on its own row, before the count and Continue', () => {
    setup();
    const reason = screen.getByText('Choose at least one person');
    const count = screen.getByText('0 selected');
    expect(reason.compareDocumentPosition(count) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // Not in the row that holds the count and Continue.
    expect(count.parentElement?.contains(reason)).toBe(false);
    expect(screen.getByRole('button', { name: 'Continue' }).parentElement?.contains(reason)).toBe(false);
  });

  it('says so when no one is saved yet', () => {
    setup({ people: [] });
    expect(screen.getByText('No one saved yet. Add someone below.')).toBeInTheDocument();
  });

  it('has no Add from your contacts unless the app passes it', () => {
    setup();
    expect(screen.queryByRole('button', { name: 'Add from your contacts' })).not.toBeInTheDocument();
  });

  it('shows Add from your contacts when the app passes it, and its notice', async () => {
    const user = userEvent.setup();
    const onPress = vi.fn();
    setup({ bringAcross: { onPress, notice: 'We could not read your contacts.' } });
    await user.click(screen.getByRole('button', { name: 'Add from your contacts' }));
    expect(onPress).toHaveBeenCalledOnce();
    expect(screen.getByText('We could not read your contacts.')).toBeInTheDocument();
  });

  it("shows What you'll need only when the app passes it", async () => {
    const user = userEvent.setup();
    const onWhatYoullNeed = vi.fn();
    setup({ onWhatYoullNeed });
    await user.click(screen.getByRole('button', { name: "What you'll need" }));
    expect(onWhatYoullNeed).toHaveBeenCalledOnce();
  });

  it('toggles a row with Space', async () => {
    const user = userEvent.setup();
    const h = setup();
    screen.getByRole('checkbox', { name: /Aunt Carol/ }).focus();
    await user.keyboard(' ');
    expect(h.onToggle).toHaveBeenCalledWith('a');
  });

  it('moves focus to Name when the form opens, and back to Add another person on Cancel', async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole('button', { name: 'Add another person' }));
    expect(screen.getByLabelText('Name')).toHaveFocus();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('button', { name: 'Add another person' })).toHaveFocus();
  });

  it('puts focus back on Add another person after a successful add', async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole('button', { name: 'Add another person' }));
    await user.type(screen.getByLabelText('Name'), 'Aunt Dee');
    await user.type(screen.getByLabelText('Mobile number'), '617 555 0148');
    await user.click(screen.getByRole('button', { name: 'Add' }));
    expect(await screen.findByRole('button', { name: 'Add another person' })).toHaveFocus();
  });

  it('announces the count politely', () => {
    setup({ selectedIds: ['a'] });
    expect(screen.getByRole('status')).toHaveTextContent('1 selected');
  });

  it('ties the bad-number error to the phone field', async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole('button', { name: 'Add another person' }));
    await user.type(screen.getByLabelText('Name'), 'Aunt Dee');
    await user.type(screen.getByLabelText('Mobile number'), '123');
    expect(screen.getByLabelText('Mobile number')).not.toHaveAttribute('aria-invalid', 'true');
    await user.click(screen.getByRole('button', { name: 'Add' }));
    const phone = screen.getByLabelText('Mobile number');
    expect(phone).toHaveAttribute('aria-invalid', 'true');
    expect(phone).toHaveAccessibleDescription(copy.badNumber);
  });

  it('explains why Continue and Add are unavailable', async () => {
    const user = userEvent.setup();
    setup();
    expect(screen.getByRole('button', { name: 'Continue' })).toHaveAccessibleDescription('Choose at least one person');
    await user.click(screen.getByRole('button', { name: 'Add another person' }));
    expect(screen.getByRole('button', { name: 'Add' })).toHaveAccessibleDescription('Enter a name and a mobile number');
  });
});
