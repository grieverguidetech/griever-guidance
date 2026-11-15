import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { screenCopy } from '@griever/copy';
import { RemovePerson } from './RemovePerson';
import type { RemoveOutcome } from './RemovePerson';

const people = [
  { id: 'p1', name: 'Anna' },
  { id: 'p2', name: 'Ben' },
];

function setup(
  overrides: Partial<Parameters<typeof RemovePerson>[0]> = {},
  outcome: RemoveOutcome = 'removed',
) {
  const onRemove = vi.fn().mockResolvedValue(outcome);
  const utils = render(<RemovePerson people={people} scope="account" onRemove={onRemove} {...overrides} />);
  return { onRemove, ...utils };
}

async function openConfirm(user: ReturnType<typeof userEvent.setup>, name = 'Anna') {
  await user.click(screen.getByRole('button', { name: `Remove ${name}` }));
}

describe('RemovePerson', () => {
  it('lists each person with one Remove button', () => {
    setup();
    expect(screen.getByRole('button', { name: 'Remove Anna' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove Ben' })).toBeInTheDocument();
  });

  it('renders nothing when there are no people', () => {
    const { container } = setup({ people: [] });
    expect(container).toBeEmptyDOMElement();
  });

  it('uses the unnamed form for a person without a name', async () => {
    const user = userEvent.setup();
    setup({ people: [{ id: 'p9', name: '' }] });
    await user.click(screen.getByRole('button', { name: 'Remove this person' }));
    expect(screen.getByRole('heading', { name: 'Remove this person?' })).toBeInTheDocument();
  });

  it('opens the account confirm with its body and moves focus to the heading', async () => {
    const user = userEvent.setup();
    setup();
    await openConfirm(user);
    const heading = screen.getByRole('heading', { name: 'Remove Anna?' });
    expect(heading).toHaveFocus();
    expect(
      screen.getByText(
        "This removes Anna and their plans from your account. People helping you will no longer see them. It can't be undone.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Keep Anna' })).toHaveClass('gg-btn-primary');
    expect(screen.getByRole('button', { name: 'Yes, remove Anna' })).toHaveClass('gg-btn-secondary');
  });

  it('uses the device body for the device scope', async () => {
    const user = userEvent.setup();
    setup({ scope: 'device' });
    await openConfirm(user);
    expect(
      screen.getByText("This removes Anna and their plans from this device. It can't be undone."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/People helping you/)).not.toBeInTheDocument();
  });

  it('uses h3 and h4 when headingLevel is 3', async () => {
    const user = userEvent.setup();
    setup({ headingLevel: 3 });
    expect(screen.getByRole('heading', { level: 3, name: 'Remove a person' })).toBeInTheDocument();
    await openConfirm(user);
    expect(screen.getByRole('heading', { level: 4, name: 'Remove Anna?' })).toBeInTheDocument();
  });

  it('Keep closes the confirm, returns focus to that button and does not remove', async () => {
    const user = userEvent.setup();
    const { onRemove } = setup();
    await openConfirm(user);
    await user.click(screen.getByRole('button', { name: 'Keep Anna' }));
    expect(screen.queryByRole('heading', { name: 'Remove Anna?' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove Anna' })).toHaveFocus();
    expect(onRemove).not.toHaveBeenCalled();
  });

  it('double press calls onRemove once and marks the buttons aria-disabled while pending', async () => {
    const user = userEvent.setup();
    let resolve: (outcome: RemoveOutcome) => void = () => undefined;
    const onRemove = vi.fn(() => new Promise<RemoveOutcome>((r) => (resolve = r)));
    render(<RemovePerson people={people} scope="account" onRemove={onRemove} />);
    await openConfirm(user);
    const yes = screen.getByRole('button', { name: 'Yes, remove Anna' });
    await user.click(yes);
    await user.click(yes);
    expect(onRemove).toHaveBeenCalledTimes(1);
    expect(onRemove).toHaveBeenCalledWith('p1');
    expect(yes).toHaveAttribute('aria-disabled', 'true');
    await act(async () => {
      resolve('removed');
    });
  });

  it('removed: says so in the status line and moves focus to the panel heading', async () => {
    const user = userEvent.setup();
    setup();
    await openConfirm(user);
    await user.click(screen.getByRole('button', { name: 'Yes, remove Anna' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Anna has been removed.');
    expect(screen.getByRole('heading', { name: 'Remove a person' })).toHaveFocus();
  });

  it('removed: keeps the panel and the status after the last person is gone', async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn().mockResolvedValue('removed');
    const { rerender } = render(
      <RemovePerson people={[people[0]]} scope="account" onRemove={onRemove} />,
    );
    await openConfirm(user);
    await user.click(screen.getByRole('button', { name: 'Yes, remove Anna' }));
    rerender(<RemovePerson people={[]} scope="account" onRemove={onRemove} />);
    expect(screen.getByRole('status')).toHaveTextContent('Anna has been removed.');
    expect(screen.getByRole('heading', { name: 'Remove a person' })).toHaveFocus();
  });

  it('removed: capitalises the unnamed form', async () => {
    const user = userEvent.setup();
    setup({ people: [{ id: 'p9', name: '' }] });
    await user.click(screen.getByRole('button', { name: 'Remove this person' }));
    await user.click(screen.getByRole('button', { name: 'Yes, remove this person' }));
    expect(await screen.findByText('This person has been removed.')).toBeInTheDocument();
  });

  it('offline: says nothing changed and returns focus to the confirm heading', async () => {
    const user = userEvent.setup();
    setup({}, 'offline');
    await openConfirm(user);
    await user.click(screen.getByRole('button', { name: 'Yes, remove Anna' }));
    expect(await screen.findByText('You need a connection to remove Anna. Nothing has changed.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Remove Anna?' })).toHaveFocus();
  });

  it('failed: says nothing changed and returns focus to the confirm heading', async () => {
    const user = userEvent.setup();
    setup({}, 'failed');
    await openConfirm(user);
    await user.click(screen.getByRole('button', { name: 'Yes, remove Anna' }));
    expect(
      await screen.findByText('We could not remove Anna just now. Nothing has changed. Please try again.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Remove Anna?' })).toHaveFocus();
  });

  it('treats a thrown error as failed', async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn().mockRejectedValue(new Error('boom'));
    render(<RemovePerson people={people} scope="account" onRemove={onRemove} />);
    await openConfirm(user);
    await user.click(screen.getByRole('button', { name: 'Yes, remove Anna' }));
    expect(await screen.findByRole('status')).toHaveTextContent('We could not remove Anna just now.');
  });

  it('with no removal, people going away renders nothing', () => {
    const onRemove = vi.fn();
    const { rerender, container } = render(<RemovePerson people={[people[0]]} scope="account" onRemove={onRemove} />);
    rerender(<RemovePerson people={[]} scope="account" onRemove={onRemove} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('uses the unnamed form for a whitespace-only name', async () => {
    const user = userEvent.setup();
    setup({ people: [{ id: 'p9', name: '   ' }] });
    expect(screen.getByRole('button', { name: 'Remove this person' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Remove this person' }));
    expect(screen.getByRole('heading', { name: 'Remove this person?' })).toBeInTheDocument();
  });

  it('does not change the case of a real name', async () => {
    const user = userEvent.setup();
    setup({ people: [{ id: 'p8', name: 'de la Cruz' }] });
    await openConfirm(user, 'de la Cruz');
    await user.click(screen.getByRole('button', { name: 'Yes, remove de la Cruz' }));
    expect(await screen.findByRole('status')).toHaveTextContent('de la Cruz has been removed.');
  });

  describe('while a removal is pending', () => {
    async function startPending(user: ReturnType<typeof userEvent.setup>) {
      let resolve: (outcome: RemoveOutcome) => void = () => undefined;
      const onRemove = vi.fn(() => new Promise<RemoveOutcome>((r) => (resolve = r)));
      render(<RemovePerson people={people} scope="account" onRemove={onRemove} />);
      await openConfirm(user);
      await user.click(screen.getByRole('button', { name: 'Yes, remove Anna' }));
      return { onRemove, finish: (o: RemoveOutcome) => act(async () => resolve(o)) };
    }

    it('shows Removing in the status line and keeps the busy button at full contrast', async () => {
      const user = userEvent.setup();
      const { finish } = await startPending(user);
      expect(screen.getByRole('status')).toHaveTextContent('Removing Anna.');
      expect(screen.getByRole('button', { name: 'Yes, remove Anna' })).toHaveClass('!opacity-100');
      await finish('removed');
    });

    it('ignores another person\'s Remove button', async () => {
      const user = userEvent.setup();
      const { finish } = await startPending(user);
      const ben = screen.getByRole('button', { name: 'Remove Ben' });
      expect(ben).toHaveAttribute('aria-disabled', 'true');
      await user.click(ben);
      expect(screen.queryByRole('heading', { name: 'Remove Ben?' })).not.toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Remove Anna?' })).toBeInTheDocument();
      await finish('removed');
    });

    it('ignores Keep', async () => {
      const user = userEvent.setup();
      const { finish } = await startPending(user);
      await user.click(screen.getByRole('button', { name: 'Keep Anna' }));
      expect(screen.getByRole('heading', { name: 'Remove Anna?' })).toBeInTheDocument();
      await finish('removed');
    });
  });

  it('retry after a failure keeps focus on the Yes button while pending', async () => {
    const user = userEvent.setup();
    let resolve: (outcome: RemoveOutcome) => void = () => undefined;
    const onRemove = vi
      .fn<(id: string) => Promise<RemoveOutcome>>()
      .mockResolvedValueOnce('failed')
      .mockImplementationOnce(() => new Promise<RemoveOutcome>((r) => (resolve = r)));
    render(<RemovePerson people={people} scope="account" onRemove={onRemove} />);
    await openConfirm(user);
    await user.click(screen.getByRole('button', { name: 'Yes, remove Anna' }));
    await screen.findByText(/We could not remove Anna/);
    const yes = screen.getByRole('button', { name: 'Yes, remove Anna' });
    yes.focus();
    await user.click(yes);
    expect(onRemove).toHaveBeenCalledTimes(2);
    expect(yes).toHaveFocus();
    await act(async () => resolve('removed'));
  });

  it('has no exclamation points in its copy', () => {
    const copy = screenCopy('account');
    const keys = Object.keys(copy).filter((k) => k.startsWith('remove')) as (keyof typeof copy)[];
    expect(keys.length).toBeGreaterThan(5);
    for (const key of keys) {
      expect(copy[key]).not.toContain('!');
    }
  });
});

describe('RemovePerson note', () => {
  it('shows the note inside the labelled section before the list', () => {
    setup({ note: 'A note.' });
    const section = screen.getByRole('region', { name: 'Remove a person' });
    expect(section).toHaveTextContent('A note.');
    expect(section.querySelector('p.gg-hint')?.nextElementSibling?.tagName).toBe('UL');
  });

  it('keeps the section for a note when the list is empty', () => {
    setup({ people: [], note: 'A note.' });
    expect(screen.getByRole('region', { name: 'Remove a person' })).toHaveTextContent('A note.');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
