import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Contact } from '@griever/shared';
import { ContactSelector } from './ContactSelector';

function contact(id: string, name: string, tier: Contact['tier']): Contact {
  return {
    contactId: id,
    name,
    phone: '+16175550148',
    email: null,
    tier,
    source: 'manual',
    createdAt: 1,
  };
}

const CONTACTS = [contact('a', 'Aunt Carol', 'first'), contact('b', 'Bob Smith', 'family')];

function setup(selectedContactIds: string[] = []) {
  const toggleContact = vi.fn();
  const flow = {
    selectedContactIds,
    toggleContact,
    selectContacts: vi.fn(),
    nextStep: vi.fn(),
    prevStep: vi.fn(),
  };
  const user = userEvent.setup();
  render(
    <ContactSelector flow={flow as never} contacts={CONTACTS} grouped onAddContact={vi.fn()} />,
  );
  return { toggleContact, user };
}

describe('ContactSelector', () => {
  it('names the groups Close family and Friends & family', () => {
    setup();
    expect(screen.getByText('Close family')).toBeInTheDocument();
    expect(screen.getByText('Friends & family')).toBeInTheDocument();
    expect(screen.queryByText(/neighbours/i)).not.toBeInTheDocument();
  });

  it("exposes each row's checked state, and preselects no one", () => {
    setup();
    expect(screen.getByRole('checkbox', { name: /Aunt Carol/ })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: /Bob Smith/ })).not.toBeChecked();
  });

  it('marks a chosen row as checked and toggles on click', async () => {
    const { toggleContact, user } = setup(['b']);
    expect(screen.getByRole('checkbox', { name: /Bob Smith/ })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /Aunt Carol/ })).not.toBeChecked();
    await user.click(screen.getByRole('checkbox', { name: /Aunt Carol/ }));
    expect(toggleContact).toHaveBeenCalledWith('a');
  });
});
