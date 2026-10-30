import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Session } from '@griever/hooks';
import { PeopleList } from './PeopleList';

function person(id: string, name: string, lastOpenedAt: string, dateOfPassing = ''): Session {
  return {
    id,
    personName: name,
    dateOfPassing,
    senderName: 'Anna',
    obituaryUrl: '',
    createdAt: lastOpenedAt,
    lastOpenedAt,
    drafts: {},
    draftsUpdatedAt: {},
    serviceReady: false,
    recipientsNotified: {},
    momentCompletedAt: {},
    remindersScheduled: [],
  } as unknown as Session;
}

const older = person('a', 'Margaret Hayes', '2026-10-10T00:00:00.000Z', '2026-05-29');
const newer = person('b', 'Harold Price', '2026-10-12T00:00:00.000Z');

describe('PeopleList', () => {
  it('lists named people newest first in a list, and opens the one chosen', async () => {
    const onOpen = vi.fn();
    render(<PeopleList sessions={[older, newer]} onOpen={onOpen} onCreate={vi.fn()} canCreate />);
    const items = within(screen.getByRole('list')).getAllByRole('listitem');
    expect(items.map((li) => li.textContent)).toEqual([expect.stringContaining('Harold Price'), expect.stringContaining('Margaret Hayes')]);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Margaret Hayes, passed May 29, 2026' }));
    expect(onOpen).toHaveBeenCalledWith('a');
  });

  it('skips unnamed people', () => {
    render(<PeopleList sessions={[person('c', '', '2026-10-13T00:00:00.000Z'), older]} onOpen={vi.fn()} onCreate={vi.fn()} canCreate />);
    expect(within(screen.getByRole('list')).getAllByRole('listitem')).toHaveLength(1);
  });

  it('offers "Someone else" to an owner with people, and "Start with" with none', async () => {
    const onCreate = vi.fn();
    const view = render(<PeopleList sessions={[older]} onOpen={vi.fn()} onCreate={onCreate} canCreate />);
    await userEvent.setup().click(screen.getByRole('button', { name: "Someone else I've lost" }));
    expect(onCreate).toHaveBeenCalledTimes(1);
    view.rerender(<PeopleList sessions={[]} onOpen={vi.fn()} onCreate={onCreate} canCreate />);
    expect(screen.getByRole('button', { name: "Start with someone I've lost" })).toBeInTheDocument();
    expect(screen.getByText('No one here yet.')).toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('shows a member the empty-state copy and no create button (C11)', () => {
    render(<PeopleList sessions={[]} onOpen={vi.fn()} onCreate={vi.fn()} canCreate={false} />);
    expect(screen.getByText("When someone adds you to help, the people you're helping will show here.")).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('has no heading of its own (the shell owns the h1)', () => {
    render(<PeopleList sessions={[older]} onOpen={vi.fn()} onCreate={vi.fn()} canCreate />);
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
  });

  it('renders each person as a soft card: no inline border, caret hidden from assistive tech, 44px target', () => {
    render(<PeopleList sessions={[older]} onOpen={vi.fn()} onCreate={vi.fn()} canCreate />);
    const card = screen.getByRole('button', { name: 'Margaret Hayes, passed May 29, 2026' });
    expect(card).toHaveClass('gg-panel', 'min-h-11');
    expect(card.getAttribute('style') ?? '').not.toMatch(/border/);
    expect(card.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    expect(card.querySelector('.gg-meta')).toHaveTextContent('May 29, 2026');
  });

  it('keeps all hover and press motion behind motion-safe', () => {
    render(<PeopleList sessions={[older]} onOpen={vi.fn()} onCreate={vi.fn()} canCreate />);
    const card = screen.getByRole('button', { name: 'Margaret Hayes, passed May 29, 2026' });
    const classes = `${card.getAttribute('class')} ${card.querySelector('svg')?.getAttribute('class')}`.split(/\s+/);
    const motion = classes.filter((c) => /translate|transition/.test(c));
    expect(motion.length).toBeGreaterThan(0);
    expect(motion.every((c) => c.startsWith('motion-safe:'))).toBe(true);
  });
});
