import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RemoveMember } from './RemoveMember';

const members = [
  { id: 'm1', name: 'Sam Lee', email: 'sam@example.com' },
  { id: 'm2', name: null, email: 'noname@example.com' },
];

describe('RemoveMember', () => {
  it('renders nothing without members', () => {
    const { container } = render(<RemoveMember members={[]} onRemove={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('offers one 44px Remove button per member, falling back to email', () => {
    render(<RemoveMember members={members} onRemove={vi.fn()} />);
    const sam = screen.getByRole('button', { name: 'Remove Sam Lee' });
    expect(sam.className).toContain('min-h-[44px]');
    expect(screen.getByRole('button', { name: 'Remove noname@example.com' })).toBeInTheDocument();
  });

  it('does not remove until confirmed', async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn(async () => true);
    render(<RemoveMember members={members} onRemove={onRemove} />);
    await user.click(screen.getByRole('button', { name: 'Remove Sam Lee' }));
    expect(onRemove).not.toHaveBeenCalled();
    expect(screen.getByText("Sam Lee won't see the people you're writing about any more.")).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Remove' }));
    expect(onRemove).toHaveBeenCalledExactlyOnceWith('m1');
  });

  it('Keep closes the step without removing', async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn(async () => true);
    render(<RemoveMember members={members} onRemove={onRemove} />);
    await user.click(screen.getByRole('button', { name: 'Remove Sam Lee' }));
    await user.click(screen.getByRole('button', { name: 'Keep' }));
    expect(onRemove).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Remove Sam Lee' })).toBeInTheDocument();
  });
});
