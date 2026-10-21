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

  it("exposes each row's selected state, and preselects no one", () => {
    setup();
    expect(screen.getByRole('button', { name: /Aunt Carol/ })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: /Bob Smith/ })).toHaveAttribute('aria-pressed', 'false');
  });

  it('marks a chosen row as pressed and toggles on click', async () => {
    const { toggleContact, user } = setup(['b']);
    expect(screen.getByRole('button', { name: /Bob Smith/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /Aunt Carol/ })).toHaveAttribute('aria-pressed', 'false');
    await user.click(screen.getByRole('button', { name: /Aunt Carol/ }));
    expect(toggleContact).toHaveBeenCalledWith('a');
  });
});
