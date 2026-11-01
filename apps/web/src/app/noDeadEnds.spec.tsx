/**
 * #597: an account with nobody saved still has the full side nav and the checklist panel (as a preview).
 * Each section opens a calm page with one next step. Real localStorage; the flags and Clerk are mocked.
 */
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ClerkLoadResult } from '../lib/authClient';
import { fakeClerk } from '../test-clerk';

const mocks = vi.hoisted(() => ({
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
vi.mock('../lib/cmsFlag', () => ({ CMS_ENABLED: true }));
vi.mock('../lib/authClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/authClient')>();
  return { ...actual, loadClerk: mocks.loadClerk };
});
vi.mock('@griever/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@griever/api-client')>();
  return { ...actual, getProfile: mocks.getProfile, getMembers: mocks.getMembers };
});

import { App } from './app';

const NAV = ['Overview', 'Your people', 'Announcement', 'Service', 'Obituary', 'Thank-yous', 'Your account'];
const CREATE = "Start with someone I've lost";
const MEMBER_LINE = 'This page fills in when someone shares a person with you.';
const MEMBER_PREVIEW_LINE = 'Your ticks are kept once someone shares a person with you.';
const PREVIEW_LINE = 'Your ticks are kept once you start with someone.';

function h1(name: string) {
  return screen.findByRole('heading', { level: 1, name });
}

function stored(): { id: string }[] {
  return JSON.parse(window.localStorage.getItem('gg.sessions.v1') ?? '[]');
}

function signedInAs(accountType: 'owner' | 'member') {
  mocks.auth = true;
  localStorage.setItem('gg.sessionsAccount.v1', 'u1');
  mocks.getProfile.mockResolvedValue({
    ok: true,
    profile: {
      id: 'u1',
      senderName: 'Anna',
      contactSource: null,
      firstName: null,
      lastName: null,
      fullName: null,
      birthDate: null,
      address: null,
      accountType,
      createdAt: '2026-10-11T00:00:00.000Z',
      updatedAt: '2026-10-11T00:00:00.000Z',
    },
  });
  mocks.loadClerk.mockResolvedValue(fakeClerk({ userId: 'u1' }).load);
  if (accountType === 'member') {
    mocks.sharing = true;
    mocks.getMembers.mockResolvedValue({ ok: true, view: { role: 'member', owner: { id: 'o1', name: 'Anna' } } });
  }
}

function expectOneEditorLayout() {
  expect(screen.getAllByRole('banner')).toHaveLength(1);
  expect(screen.getAllByRole('navigation', { name: /^Sections/ })).toHaveLength(1);
  expect(screen.getAllByRole('main')).toHaveLength(1);
  expect(screen.getAllByRole('complementary')).toHaveLength(1);
}

function expectFullNav() {
  const nav = screen.getByRole('navigation', { name: /^Sections/ });
  expect(within(nav).getAllByRole('button').map((b) => b.textContent?.trim())).toEqual(NAV);
  return nav;
}

beforeEach(() => {
  mocks.auth = false;
  mocks.sharing = false;
  mocks.loadClerk.mockReset();
  mocks.getProfile.mockReset();
  mocks.getMembers.mockReset();
  window.localStorage.clear();
  window.sessionStorage.clear();
  window.history.replaceState(null, '', '/');
});

describe.each(['owner', 'member'] as const)('an empty %s account (#597)', (kind) => {
  async function open() {
    signedInAs(kind);
    const user = userEvent.setup();
    render(<App />);
    await h1('Overview');
    return user;
  }

  async function openPeople(user: ReturnType<typeof userEvent.setup>) {
    await user.click(within(screen.getByRole('navigation', { name: /^Sections/ })).getByRole('button', { name: 'Your people' }));
    await h1('Your people');
  }

  it('shows the full nav and the checklist preview on Your people', async () => {
    await openPeople(await open());
    expectFullNav();
    expectOneEditorLayout();
    const aside = screen.getByRole('complementary', { name: "What you'll need" });
    expect(aside.querySelector('[data-checklist-item]')).not.toBeNull();
    expect(within(aside).getByText(kind === 'owner' ? PREVIEW_LINE : MEMBER_PREVIEW_LINE)).toBeInTheDocument();
    expect(within(aside).queryByRole('button', { name: /Done/ })).toBeNull();
    expect(screen.getByRole('button', { name: "What you'll need" })).toBeInTheDocument();
  });

  it.each(['Overview', 'Announcement', 'Service', 'Obituary', 'Thank-yous'])(
    'opens %s with one next step and keeps the layout',
    async (name) => {
      const user = await open();
      await user.click(within(screen.getByRole('navigation', { name: /^Sections/ })).getByRole('button', { name: new RegExp(`^${name}`) }));
      const heading = await h1(name);
      await waitFor(() => expect(heading).toHaveFocus());
      expectFullNav();
      expectOneEditorLayout();
      const nav = screen.getByRole('navigation', { name: /^Sections/ });
      expect(within(nav).getByRole('button', { name: new RegExp(`^${name}`) })).toHaveAttribute('aria-current', 'page');
      const main = screen.getByRole('main');
      if (kind === 'owner') {
        expect(within(main).getByRole('button', { name: CREATE })).toBeInTheDocument();
      } else {
        expect(within(main).getByText(MEMBER_LINE)).toBeInTheDocument();
        expect(within(main).queryByRole('button', { name: CREATE })).toBeNull();
      }
      expect(stored()).toHaveLength(0);
    },
  );

  it('opens a checklist item from the panel, shows its guidance, and Back returns to the empty page', async () => {
    const user = await open();
    await user.click(within(screen.getByRole('navigation', { name: /^Sections/ })).getByRole('button', { name: /^Service/ }));
    await h1('Service');
    const aside = screen.getByRole('complementary', { name: "What you'll need" });
    const opener = aside.querySelector<HTMLElement>('[data-checklist-item]');
    expect(opener).not.toBeNull();
    // The first phase is open on load; the item's name is its heading once opened.
    const label = opener?.textContent ?? '';
    await user.click(opener as HTMLElement);
    await h1(label);
    const main = screen.getByRole('main');
    expect(within(main).queryByRole('button', { name: /Done|Doesn't apply/ })).toBeNull();
    expectOneEditorLayout();
    await user.click(within(main).getByRole('button', { name: 'Back' }));
    await h1('Service');
    expect(stored()).toHaveLength(0);
  });

  it('Back from an item opened in the panel on the Overview or Your account returns there', async () => {
    const user = await open();
    const firstItem = () => screen.getByRole('complementary', { name: "What you'll need" }).querySelector<HTMLElement>('[data-checklist-item]') as HTMLElement;
    let label = firstItem().textContent ?? '';
    await user.click(firstItem());
    await h1(label);
    await user.click(within(screen.getByRole('main')).getByRole('button', { name: 'Back' }));
    await h1('Overview');
    await user.click(screen.getByRole('button', { name: 'Your account' }));
    await h1('Account');
    label = firstItem().textContent ?? '';
    await user.click(firstItem());
    await h1(label);
    await user.click(within(screen.getByRole('main')).getByRole('button', { name: 'Back' }));
    await h1('Account');
    expectFullNav();
  });

  it('browser Back and Forward walk the empty pages', async () => {
    const user = await open();
    const nav = () => within(screen.getByRole('navigation', { name: /^Sections/ }));
    await user.click(nav().getByRole('button', { name: /^Obituary/ }));
    await h1('Obituary');
    await user.click(nav().getByRole('button', { name: /^Service/ }));
    await h1('Service');
    window.history.back();
    await h1('Obituary');
    expect(nav().getByRole('button', { name: /^Obituary/ })).toHaveAttribute('aria-current', 'page');
    window.history.forward();
    await h1('Service');
  });

  it('keeps the full nav on Your account', async () => {
    const user = await open();
    await user.click(screen.getByRole('button', { name: 'Your account' }));
    await h1('Account');
    expectFullNav();
    expectOneEditorLayout();
    expect(screen.getByRole('complementary', { name: "What you'll need" }).querySelector('[data-checklist-item]')).not.toBeNull();
    await user.click(within(screen.getByRole('navigation', { name: /^Sections/ })).getByRole('button', { name: /^Thank-yous/ }));
    await h1('Thank-yous');
  });
});

describe('an empty owner account starts from a section (#597)', () => {
  it('creates the person and lands on The person, whichever page Start was pressed on (#603)', async () => {
    signedInAs('owner');
    const user = userEvent.setup();
    render(<App />);
    await h1('Overview');
    await user.click(within(screen.getByRole('navigation', { name: /^Sections/ })).getByRole('button', { name: /^Obituary/ }));
    await h1('Obituary');
    await user.click(within(screen.getByRole('main')).getByRole('button', { name: CREATE }));
    await h1('The person');
    expect(stored()).toHaveLength(1);
    const aside = screen.getByRole('complementary', { name: "What you'll need" });
    expect(within(aside).queryByText(PREVIEW_LINE)).toBeNull();
    expect(screen.queryByRole('button', { name: /Change/ })).not.toBeInTheDocument();
    expect(within(screen.getByRole('main')).queryByRole('button', { name: CREATE })).toBeNull();
  });

  it('browser Back after Start leaves the empty page for Your people, with no arrival note', async () => {
    signedInAs('owner');
    const user = userEvent.setup();
    render(<App />);
    await h1('Overview');
    await user.click(within(screen.getByRole('navigation', { name: /^Sections/ })).getByRole('button', { name: 'Your people' }));
    await h1('Your people');
    await user.click(within(screen.getByRole('navigation', { name: /^Sections/ })).getByRole('button', { name: /^Obituary/ }));
    await h1('Obituary');
    await user.click(within(screen.getByRole('main')).getByRole('button', { name: CREATE }));
    await waitFor(() => expect(stored()).toHaveLength(1));
    // Some content makes the new person listable, so the empty page would otherwise be redirected away from.
    await user.type(await screen.findByLabelText('Their name'), 'Margaret');
    window.history.back();
    await h1('Your people');
    expect(screen.getByRole('heading', { level: 1, name: 'Your people' })).toBeInTheDocument();
    expect(screen.queryByText('A person is here now. Their page is open.')).toBeNull();
  });
});
