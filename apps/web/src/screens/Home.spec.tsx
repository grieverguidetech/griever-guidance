import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Session } from '@griever/hooks';
import { Home } from './Home';

function make(id: string, personName: string, lastOpenedAt: string, dateOfPassing = ''): Session {
  return {
    id,
    flowId: `flow-${id}`,
    ownerId: null,
    role: 'owner',
    createdAt: lastOpenedAt,
    lastOpenedAt,
    personName,
    dateOfPassing,
    senderName: 'Anna',
    obituaryUrl: '',
    drafts: {},
    serviceReady: false,
    recipientsNotified: {},
    momentCompletedAt: {},
    remindersScheduled: [],
  };
}

const sessions = [
  make('old', 'Walter Hale', '2026-05-01T00:00:00.000Z', '2026-04-20'),
  make('blank', '  ', '2026-07-01T00:00:00.000Z'),
  make('new', 'Margaret Hale', '2026-06-01T00:00:00.000Z', 'May 29, 2026'),
];

function setup(props: Partial<Parameters<typeof Home>[0]> = {}) {
  const onOpen = vi.fn();
  const onCreate = vi.fn();
  render(<Home sessions={sessions} onOpen={onOpen} onCreate={onCreate} canCreate {...props} />);
  return { onOpen, onCreate };
}

const originalTZ = process.env.TZ;
beforeAll(() => {
  // West of UTC, so a date parsed as UTC midnight would show the day before.
  process.env.TZ = 'America/Los_Angeles';
});
afterAll(() => {
  if (originalTZ === undefined) delete process.env.TZ;
  else process.env.TZ = originalTZ;
});

describe('Home', () => {
  it('has exactly one h1', () => {
    setup();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe("Who you're writing about");
  });

  it('lists people newest first and leaves out empty names', () => {
    setup();
    const rows = within(screen.getByRole('list')).getAllByRole('button');
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain('Margaret Hale');
    expect(rows[1].textContent).toContain('Walter Hale');
  });

  it('shows the date of passing, formatted, in each row', () => {
    setup();
    expect(screen.getByRole('button', { name: /Margaret Hale/ }).textContent).toContain('May 29, 2026');
    expect(screen.getByRole('button', { name: /Walter Hale/ }).textContent).toContain('April 20, 2026');
  });

  it('names each row with the person and when they passed', () => {
    setup();
    expect(screen.getByRole('button', { name: 'Margaret Hale, passed May 29, 2026' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Walter Hale, passed April 20, 2026' })).toBeTruthy();
  });

  it('shows a date that is not complete exactly as typed', () => {
    setup({ sessions: [make('a', 'Ruth Hale', '2026-06-01T00:00:00.000Z', 'late May')] });
    expect(screen.getByRole('button', { name: 'Ruth Hale, passed late May' }).textContent).toContain('late May');
  });

  it('renders no date line when the date is empty', () => {
    setup({ sessions: [make('a', 'Ruth Hale', '2026-06-01T00:00:00.000Z', '')] });
    const row = screen.getByRole('button', { name: 'Ruth Hale' });
    expect(row.textContent).toBe('Ruth Hale');
  });

  it('keeps every row at least 44px tall and the list announced as a list', () => {
    setup();
    for (const row of within(screen.getByRole('list')).getAllByRole('button')) {
      expect(row.style.minHeight).toBe('44px');
    }
    expect(screen.getByRole('list').getAttribute('role')).toBe('list');
  });

  it('explains the empty state to someone who cannot create', () => {
    setup({ sessions: [], canCreate: false });
    expect(
      screen.getByText("When someone adds you to help, the people you're helping will show here."),
    ).toBeTruthy();
  });

  it('does not show the member line when people exist or create is allowed', () => {
    setup({ canCreate: false });
    expect(screen.queryByText(/When someone adds you/)).toBeNull();
  });

  it('opens the person that was pressed', async () => {
    const user = userEvent.setup();
    const { onOpen } = setup();
    await user.click(screen.getByRole('button', { name: /Walter Hale/ }));
    expect(onOpen).toHaveBeenCalledExactlyOnceWith('old');
  });

  it('creates a new one, worded as someone else when people exist', async () => {
    const user = userEvent.setup();
    const { onCreate } = setup();
    await user.click(screen.getByRole('button', { name: "Someone else I've lost" }));
    expect(onCreate).toHaveBeenCalledTimes(1);
  });

  it('invites a first person when the list is empty', () => {
    setup({ sessions: [make('blank', '', '2026-07-01T00:00:00.000Z')] });
    expect(screen.queryByRole('list')).toBeNull();
    expect(screen.getByRole('button', { name: "Start with someone I've lost" })).toBeTruthy();
  });

  it('does not render create when canCreate is false', () => {
    setup({ canCreate: false });
    expect(screen.queryByRole('button', { name: /I've lost/ })).toBeNull();
    expect(screen.getAllByRole('button', { name: /Hale/ })).toHaveLength(2);
  });

  it('has no "What you\'ll need" link; the list lives on "Your account" (#190)', () => {
    setup();
    expect(screen.queryByRole('button', { name: "What you'll need" })).toBeNull();
    expect(screen.queryByText('The people you\'re writing about')).toBeNull();
  });

  it('says so calmly when nobody is listed yet and the person can create', () => {
    setup({ sessions: [] });
    expect(screen.getByText('No one here yet.')).toBeInTheDocument();
  });

  it('does not say it once someone is listed', () => {
    setup();
    expect(screen.queryByText('No one here yet.')).not.toBeInTheDocument();
  });
});
