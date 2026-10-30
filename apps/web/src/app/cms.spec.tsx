/**
 * #395: the web editor wired into the real App behind CMS_ENABLED. Real localStorage; a "remount" is
 * an unmount and a fresh <App /> over the same storage. The flag is mocked per test.
 */
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ClerkLoadResult } from '../lib/authClient';
import { fakeClerk } from '../test-clerk';

const mocks = vi.hoisted(() => ({
  cms: true,
  auth: false,
  sharing: false,
  loadClerk: vi.fn<() => Promise<ClerkLoadResult>>(),
  getProfile: vi.fn(),
  getMembers: vi.fn(),
}));

vi.mock('../lib/features', () => ({
  get AUTH_ENABLED() {
    return mocks.auth;
  },
  OBITUARY_DRAFTING_ENABLED: false,
  PAYMENTS_ENABLED: false,
  get SHARING_ENABLED() {
    return mocks.sharing;
  },
}));
vi.mock('../lib/cmsFlag', () => ({
  get CMS_ENABLED() {
    return mocks.cms;
  },
}));
vi.mock('../lib/authClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/authClient')>();
  return { ...actual, loadClerk: mocks.loadClerk };
});
vi.mock('@griever/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@griever/api-client')>();
  return { ...actual, getProfile: mocks.getProfile, getMembers: mocks.getMembers };
});

import { App } from './app';

const PEOPLE = 'Your people';
const HOME = "Who you're writing about";
const CREATE = "Start with someone I've lost";

function person(id: string, name: string, openedAt: string) {
  return {
    id,
    personName: name,
    dateOfPassing: '',
    senderName: 'Anna',
    obituaryUrl: '',
    createdAt: openedAt,
    lastOpenedAt: openedAt,
    drafts: {},
    draftsUpdatedAt: {},
    serviceReady: false,
    recipientsNotified: {},
    momentCompletedAt: {},
    remindersScheduled: [],
  };
}

function seed(...people: ReturnType<typeof person>[]) {
  window.localStorage.setItem('gg.sessions.v1', JSON.stringify(people));
}

function stored(): { id: string; personName: string; lastOpenedAt: string; sectionStatus?: Record<string, string> }[] {
  return JSON.parse(window.localStorage.getItem('gg.sessions.v1') ?? '[]');
}

async function expectHome() {
  expect(await screen.findByRole('heading', { level: 1, name: HOME })).toBeInTheDocument();
}

async function expectPeople() {
  expect(await screen.findByRole('heading', { level: 1, name: PEOPLE })).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: HOME })).not.toBeInTheDocument();
}

/** Loading with one saved person lands on their Overview (#448). */
async function openMargaret() {
  seed(person('s1', 'Margaret Hayes', '2026-10-10T00:00:00.000Z'));
  render(<App />);
  return screen.findByRole('heading', { level: 1, name: 'Overview' });
}

beforeEach(() => {
  mocks.cms = true;
  mocks.auth = false;
  mocks.sharing = false;
  mocks.loadClerk.mockReset();
  mocks.getProfile.mockReset();
  mocks.getMembers.mockReset();
  window.localStorage.clear();
});

describe('editor on (#395)', () => {
  it('opens a person on their Overview and records the visit', async () => {
    await openMargaret();
    expect(screen.queryByRole('heading', { name: 'One thing at a time.' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: /^Now:/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^On the checklist/ })).toBeInTheDocument();
    expect(Date.parse(stored()[0].lastOpenedAt)).toBeGreaterThan(Date.parse('2026-10-10T00:00:00.000Z'));
  });

  it('"Create a new one" opens The person directly, and a typed name survives a remount', async () => {
    const user = userEvent.setup();
    const view = render(<App />);
    // Nobody saved: loading opens The person directly (#448). Home's button is covered in cmsLanding.spec.tsx.
    expect(await screen.findByRole('heading', { level: 1, name: 'The person' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /contacts|who hears first/i })).not.toBeInTheDocument();
    await user.type(screen.getByLabelText('Their name'), 'Harold Price');
    view.unmount();
    render(<App />);
    await screen.findByRole('heading', { level: 1, name: 'Overview' });
    await user.click(screen.getByRole('button', { name: /Change/ }));
    await expectPeople();
    expect(screen.getByRole('button', { name: 'Harold Price' })).toBeInTheDocument();
    expect(stored()[0].sectionStatus).toEqual({ person: 'in_progress' });
  });

  it('marking Service ready shows Ready on the Overview', async () => {
    const user = userEvent.setup();
    await openMargaret();
    await user.click(within(screen.getByRole('main')).getByRole('button', { name: /^Service/ }));
    await screen.findByRole('heading', { level: 1, name: 'Service' });
    await user.click(screen.getByRole('button', { name: 'Mark as ready' }));
    expect(stored()[0].sectionStatus).toEqual({ service: 'ready' });
    await user.click(screen.getByRole('button', { name: /^Overview/ }));
    await screen.findByRole('heading', { level: 1, name: 'Overview' });
    expect(within(screen.getByRole('main')).getByRole('button', { name: /^Service/ })).toHaveTextContent('Ready');
  });

  it('"Change" returns to Home and drops an unnamed person', async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole('heading', { level: 1, name: 'The person' });
    expect(stored()).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: /Change/ }));
    await expectPeople();
    expect(screen.getByRole('heading', { level: 1, name: PEOPLE })).toHaveFocus();
    expect(stored()).toHaveLength(0);
  });

  it('"Change" keeps an unnamed person who has service data', async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole('heading', { level: 1, name: 'The person' });
    await user.click(screen.getByRole('button', { name: 'Service' }));
    await screen.findByRole('heading', { level: 1, name: 'Service' });
    await user.type(screen.getAllByLabelText('Date')[0], 'May 29, 2026');
    await user.click(screen.getByRole('button', { name: /Change/ }));
    await expectPeople();
    expect(stored()).toHaveLength(1);
    expect(stored()[0].personName).toBe('');
  });

  it('taking "Mark as ready" back on Service sets In progress and clears serviceReady', async () => {
    const user = userEvent.setup();
    await openMargaret();
    await user.click(within(screen.getByRole('main')).getByRole('button', { name: /^Service/ }));
    await screen.findByRole('heading', { level: 1, name: 'Service' });
    await user.click(screen.getByRole('button', { name: 'Mark as ready' }));
    expect(stored()[0]).toMatchObject({ serviceReady: true });
    await user.click(screen.getByRole('button', { name: 'Mark as ready' }));
    expect(stored()[0].sectionStatus?.['service']).toBe('in_progress');
    expect(stored()[0]).toMatchObject({ serviceReady: false });
  });

  it('"Change" keeps a named person', async () => {
    const user = userEvent.setup();
    await openMargaret();
    await user.click(screen.getByRole('button', { name: /Change/ }));
    await expectPeople();
    expect(stored()).toHaveLength(1);
  });

  it('shows the coming-later note for Announcement, Obituary and Thank-yous', async () => {
    const user = userEvent.setup();
    await openMargaret();
    for (const name of ['Announcement', 'Obituary', 'Thank-yous']) {
      await user.click(within(screen.getByRole('navigation', { name: 'Sections' })).getByRole('button', { name }));
      await screen.findByRole('heading', { level: 1, name });
      expect(screen.getByText('This part comes later. Nothing is needed here yet.')).toBeInTheDocument();
    }
  });

  it('reaches no path, wizard, sms: link or "Open Messages" from any section', async () => {
    const user = userEvent.setup();
    await openMargaret();
    for (const name of ['Overview', 'The person', 'Announcement', 'Service', 'Obituary', 'Thank-yous']) {
      await user.click(within(screen.getByRole('navigation', { name: 'Sections' })).getByRole('button', { name }));
      await screen.findByRole('heading', { level: 1, name });
      expect(document.querySelector('a[href^="sms:"]')).toBeNull();
      expect(screen.queryByText(/Open Messages/i)).not.toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: 'One thing at a time.' })).not.toBeInTheDocument();
    }
  });

  it('moves focus to the h1 when an Overview row or Next opens a section', async () => {
    const user = userEvent.setup();
    await openMargaret();
    await user.click(within(screen.getByRole('main')).getByRole('button', { name: /^Service/ }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Service' })).toHaveFocus();
    await user.click(screen.getByRole('button', { name: /^Overview/ }));
    await screen.findByRole('heading', { level: 1, name: 'Overview' });
    await user.click(screen.getByRole('button', { name: 'Next: The person' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'The person' })).toHaveFocus();
  });

  it('"Your account" opens Settings when nobody is signed in, and Back returns to the Overview', async () => {
    const user = userEvent.setup();
    await openMargaret();
    await user.click(screen.getByRole('button', { name: 'Your account' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Settings' })).toHaveFocus();
    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Overview' })).toHaveFocus();
  });
});

describe('editor on, signed in (#395)', () => {
  function signedInAs(accountType: 'owner' | 'member') {
    mocks.auth = true;
    mocks.getProfile.mockResolvedValue({
      ok: true,
      profile: {
        id: 'u1',
        senderName: 'Anna',
        contactSource: null,
        accountType,
        createdAt: '2026-10-11T00:00:00.000Z',
        updatedAt: '2026-10-11T00:00:00.000Z',
      },
    });
    mocks.loadClerk.mockResolvedValue(fakeClerk({ userId: 'u1' }).load);
  }

  it('"Your account" opens the profile, and Back returns to the Overview', async () => {
    signedInAs('owner');
    const user = userEvent.setup();
    seed(person('s1', 'Margaret Hayes', '2026-10-10T00:00:00.000Z'));
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Margaret Hayes' }));
    await screen.findByRole('heading', { level: 1, name: 'Overview' });
    await user.click(screen.getByRole('button', { name: 'Your account' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Your account' })).toHaveFocus();
    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Overview' })).toHaveFocus();
  });

  it('a member has no "Create a new one"', async () => {
    mocks.sharing = true;
    mocks.getMembers.mockResolvedValue({ ok: true, view: { role: 'member', owner: { id: 'o1', name: 'Anna' } } });
    signedInAs('member');
    render(<App />);
    await screen.findByRole('button', { name: 'Your account' });
    await waitFor(() => expect(screen.queryByRole('button', { name: CREATE })).not.toBeInTheDocument());
  });

  it('an owner with nobody saved lands on The person', async () => {
    mocks.sharing = true;
    mocks.getMembers.mockResolvedValue({ ok: true, view: { role: 'owner', members: [], invites: [] } });
    signedInAs('owner');
    render(<App />);
    expect(await screen.findByRole('heading', { level: 1, name: 'The person' })).toBeInTheDocument();
  });
});

describe('editor off (#395)', () => {
  it('opens the path from Home, as before', async () => {
    mocks.cms = false;
    const user = userEvent.setup();
    seed(person('s1', 'Margaret Hayes', '2026-10-10T00:00:00.000Z'));
    render(<App />);
    await expectHome();
    await user.click(screen.getByRole('button', { name: 'Margaret Hayes' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'One thing at a time.' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 1, name: 'Overview' })).not.toBeInTheDocument();
  });
});
