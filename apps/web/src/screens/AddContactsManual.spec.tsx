import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AddContactsManual } from './AddContactsManual';

const LABEL = 'One of the people who should hear first';

function setup() {
  const onAdd = vi.fn();
  const user = userEvent.setup();
  render(<AddContactsManual contacts={[]} onAdd={onAdd} onDone={vi.fn()} />);
  return { onAdd, user };
}

async function fillAndAdd(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Name'), 'Aunt Carol');
  await user.type(screen.getByLabelText('Mobile number'), '6175550148');
  await user.click(screen.getByRole('button', { name: 'Add and start another' }));
}

describe('AddContactsManual hears-first checkbox', () => {
  it('is a real checkbox, unchecked to begin with', () => {
    setup();
    expect(screen.getByRole('checkbox', { name: LABEL })).not.toBeChecked();
  });

  it('toggles with a click and passes hearsFirst on add', async () => {
    const { onAdd, user } = setup();
    const box = screen.getByRole('checkbox', { name: LABEL });
    await user.click(box);
    expect(box).toBeChecked();
    await fillAndAdd(user);
    expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ name: 'Aunt Carol', hearsFirst: true }));
    expect(box).not.toBeChecked();
  });

  it('is reachable by Tab and toggles with Space', async () => {
    const { onAdd, user } = setup();
    const box = screen.getByRole('checkbox', { name: LABEL });
    await user.type(screen.getByLabelText('Name'), 'Aunt Carol');
    await user.type(screen.getByLabelText('Mobile number'), '6175550148');
    await user.tab();
    expect(box).toHaveFocus();
    await user.keyboard(' ');
    expect(box).toBeChecked();
    await user.click(screen.getByRole('button', { name: 'Add and start another' }));
    expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ hearsFirst: true }));
  });

  it('adds with hearsFirst false when left unticked', async () => {
    const { onAdd, user } = setup();
    await fillAndAdd(user);
    expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ hearsFirst: false }));
  });
});
