import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RemoveMember } from './RemoveMember';

const members = [
  { id: 'm1', name: 'Sam Lee', email: 'sam@example.com' },
  { id: 'm2', name: null, email: 'noname@example.com' },
];
const FAILED = 'You need a connection to do this.';

function setup(onRemove: (id: string) => Promise<boolean> = vi.fn(async () => true), message: string | null = null) {
  render(<RemoveMember members={members} message={message} onRemove={onRemove} />);
  return onRemove;
}

describe('RemoveMember', () => {
  it('renders nothing at all, heading included, without members', () => {
    const { container } = render(<RemoveMember members={[]} message={null} onRemove={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('offers one Remove button per member, falling back to email, under one heading', () => {
    setup();
    expect(screen.getByRole('heading', { level: 2, name: 'People helping you' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove Sam Lee' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove noname@example.com' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });

  it('does not remove until confirmed', async () => {
    const user = userEvent.setup();
    const onRemove = setup();
    await user.click(screen.getByRole('button', { name: 'Remove Sam Lee' }));
    expect(onRemove).not.toHaveBeenCalled();
    expect(screen.getByText("Sam Lee won't see the people you're writing about any more.")).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Remove' }));
    expect(onRemove).toHaveBeenCalledExactlyOnceWith('m1');
  });

  it('Keep closes the step without removing and returns focus to that row button', async () => {
    const user = userEvent.setup();
    const onRemove = setup();
    await user.click(screen.getByRole('button', { name: 'Remove noname@example.com' }));
    await user.click(screen.getByRole('button', { name: 'Keep' }));
    expect(onRemove).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Remove noname@example.com' })).toHaveFocus();
  });

  it('announces a removal and moves focus to the section heading', async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole('button', { name: 'Remove Sam Lee' }));
    await user.click(screen.getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Sam Lee has been removed.'));
    expect(screen.getByRole('heading', { name: 'People helping you' })).toHaveFocus();
  });

  it('shows the passed message and returns focus to the row button when removal fails', async () => {
    const user = userEvent.setup();
    setup(vi.fn(async () => false), FAILED);
    await user.click(screen.getByRole('button', { name: 'Remove Sam Lee' }));
    await user.click(screen.getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(FAILED));
    expect(screen.getByRole('button', { name: 'Remove Sam Lee' })).toHaveFocus();
  });
});
