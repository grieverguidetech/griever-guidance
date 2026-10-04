import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Contact } from '@griever/shared';
import { WhoHearsFirst } from './WhoHearsFirst';

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

const CONTACTS = [contact('a', 'Aunt Carol', 'first'), contact('b', 'Bob Smith', 'friends')];

function setup() {
  const onSave = vi.fn();
  const user = userEvent.setup();
  render(<WhoHearsFirst contacts={CONTACTS} onBack={vi.fn()} onSave={onSave} />);
  return { onSave, user };
}

describe('WhoHearsFirst checkboxes', () => {
  it('shows a checkbox per contact, checked for those who already hear first', () => {
    setup();
    expect(screen.getByRole('checkbox', { name: 'Aunt Carol' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Bob Smith' })).not.toBeChecked();
  });

  it('names each checkbox by the contact and describes it with the number', () => {
    setup();
    expect(screen.getByRole('checkbox', { name: 'Aunt Carol' })).toHaveAccessibleDescription(
      '(617) 555-0148',
    );
  });

  it('toggles with a click and saves the ticked ids', async () => {
    const { onSave, user } = setup();
    await user.click(screen.getByRole('checkbox', { name: 'Bob Smith' }));
    await user.click(screen.getByRole('checkbox', { name: 'Aunt Carol' }));
    await user.click(screen.getByRole('button', { name: 'Save and continue' }));
    expect(onSave).toHaveBeenCalledWith(['b']);
  });

  it('is reachable by Tab and toggles with Space', async () => {
    const { onSave, user } = setup();
    const bob = screen.getByRole('checkbox', { name: 'Bob Smith' });
    for (let i = 0; i < 10 && bob !== document.activeElement; i++) await user.tab();
    expect(bob).toHaveFocus();
    await user.keyboard(' ');
    expect(bob).toBeChecked();
    await user.click(screen.getByRole('button', { name: 'Save and continue' }));
    expect(onSave).toHaveBeenCalledWith(expect.arrayContaining(['a', 'b']));
  });
});
