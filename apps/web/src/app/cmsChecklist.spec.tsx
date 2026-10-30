/**
 * #421: the checklist panel and item detail wired into the editor. Focus rules from the #417/#418
 * audits: opening an item focuses the shell h1 (titled with the item), opening from the phone sheet
 * closes the sheet, and Back returns to the button that opened the item.
 */
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const mocks = vi.hoisted(() => ({ cms: true }));

vi.mock('../lib/cmsFlag', () => ({
  get CMS_ENABLED() {
    return mocks.cms;
  },
}));

import { App } from './app';

const ITEM = 'Get a legal pronouncement of death';
const NEXT = `Next on the list: ${ITEM}`;

function seed(checklist: Record<string, string> = {}) {
  window.localStorage.setItem(
    'gg.sessions.v1',
    JSON.stringify([
      {
        id: 's1',
        personName: 'Margaret Hayes',
        dateOfPassing: '',
        senderName: 'Anna',
        obituaryUrl: '',
        createdAt: '2026-10-10T00:00:00.000Z',
        lastOpenedAt: '2026-10-10T00:00:00.000Z',
        drafts: {},
        draftsUpdatedAt: {},
        serviceReady: false,
        recipientsNotified: {},
        momentCompletedAt: {},
        remindersScheduled: [],
        checklist,
      },
    ]),
  );
}

async function openOverview(user: ReturnType<typeof userEvent.setup>) {
  render(<App />);
  await user.click(await screen.findByRole('button', { name: 'Margaret Hayes' }));
  await screen.findByRole('heading', { level: 1, name: 'Overview' });
}

function stored(): { checklist?: Record<string, string> } {
  return JSON.parse(window.localStorage.getItem('gg.sessions.v1') ?? '[]')[0];
}

beforeEach(() => {
  mocks.cms = true;
  window.localStorage.clear();
  seed();
});

describe('checklist in the editor (#421)', () => {
  it('opens an item from the panel: the h1 takes focus, and Back returns to the panel button', async () => {
    const user = userEvent.setup();
    await openOverview(user);
    const panel = within(screen.getByRole('complementary', { name: "What you'll need" }));
    const opener = panel.getByRole('button', { name: ITEM });
    await user.click(opener);
    const heading = await screen.findByRole('heading', { level: 1, name: ITEM });
    expect(heading).toHaveFocus();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(within(screen.getByRole('main')).getAllByRole('heading', { level: 2 }).length).toBeGreaterThan(0);
    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Overview' })).toBeInTheDocument();
    expect(opener).toHaveFocus();
  });

  it('opens the next item from the Overview, and Back returns to the Overview button', async () => {
    const user = userEvent.setup();
    await openOverview(user);
    await user.click(within(screen.getByRole('main')).getByRole('button', { name: NEXT }));
    expect(await screen.findByRole('heading', { level: 1, name: ITEM })).toHaveFocus();
    await user.click(screen.getByRole('button', { name: 'Back' }));
    await screen.findByRole('heading', { level: 1, name: 'Overview' });
    expect(within(screen.getByRole('main')).getByRole('button', { name: NEXT })).toHaveFocus();
  });

  it('opens an item from the phone sheet, closes the sheet, and Back falls to the h1', async () => {
    const user = userEvent.setup();
    await openOverview(user);
    await user.click(screen.getByRole('button', { name: "What you'll need" }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: ITEM }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(await screen.findByRole('heading', { level: 1, name: ITEM })).toHaveFocus();
    await user.click(screen.getByRole('button', { name: 'Back' }));
    const overview = await screen.findByRole('heading', { level: 1, name: 'Overview' });
    expect(overview).toHaveFocus();
  });

  it('saves a state set on the detail, and a section choice leaves the detail', async () => {
    const user = userEvent.setup();
    await openOverview(user);
    await user.click(within(screen.getByRole('main')).getByRole('button', { name: NEXT }));
    await screen.findByRole('heading', { level: 1, name: ITEM });
    await user.click(within(screen.getByRole('main')).getByRole('button', { name: 'Done' }));
    expect(stored().checklist).toEqual({ pronouncement: 'done' });
    await user.click(screen.getByRole('button', { name: 'Service' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Service' })).toHaveFocus();
  });

  it('sets a state from the panel without opening the detail', async () => {
    const user = userEvent.setup();
    await openOverview(user);
    const group = within(screen.getByRole('complementary')).getByRole('group', { name: ITEM });
    await user.click(within(group).getByRole('button', { name: 'Done' }));
    expect(stored().checklist).toEqual({ pronouncement: 'done' });
    expect(screen.getByRole('heading', { level: 1, name: 'Overview' })).toBeInTheDocument();
  });
});
