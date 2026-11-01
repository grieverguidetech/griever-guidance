/**
 * #603 (Peter's walkthrough round 3): sign-up lands on the Overview with names from Clerk, the account
 * page is titled "Account", Overview and Your people are different pages with nobody saved, "Start with
 * someone I've lost" always opens The person, and the side nav is the same in every state.
 */
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ClerkLoadResult } from '../lib/authClient';
import { fakeClerk } from '../test-clerk';

const mocks = vi.hoisted(() => ({
  auth: false,
  loadClerk: vi.fn<() => Promise<ClerkLoadResult>>(),
  getProfile: vi.fn(),
  updateProfile: vi.fn(),
}));

vi.mock('../lib/features', () => ({
  get AUTH_ENABLED() {
    return mocks.auth;
  },
  OBITUARY_DRAFTING_ENABLED: false,
  PAYMENTS_ENABLED: false,
  SHARING_ENABLED: false,
}));
vi.mock('../lib/cmsFlag', () => ({ CMS_ENABLED: true }));
vi.mock('../lib/authClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/authClient')>();
  return { ...actual, loadClerk: mocks.loadClerk };
});
vi.mock('@griever/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@griever/api-client')>();
  return { ...actual, getProfile: mocks.getProfile, updateProfile: mocks.updateProfile };
});

import { App } from './app';

const CREATE = "Start with someone I've lost";
const NAME_NOTE = 'Add your first name in Account so your messages are signed.';

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

function h1(name: string) {
  return screen.findByRole('heading', { level: 1, name });
}

function profile(extra: Record<string, unknown> = {}) {
  return {
    id: 'u1',
    senderName: null,
    contactSource: null,
    firstName: null,
    lastName: null,
    fullName: null,
    birthDate: null,
    address: null,
    accountType: 'owner',
    createdAt: '2026-10-11T00:00:00.000Z',
    updatedAt: '2026-10-11T00:00:00.000Z',
    ...extra,
  };
}

function signedIn(names?: { firstName: string | null; lastName: string | null }, stored: Record<string, unknown> | null = null) {
  mocks.auth = true;
  localStorage.setItem('gg.sessionsAccount.v1', 'u1');
  mocks.getProfile.mockResolvedValue(stored ? { ok: true, profile: profile(stored) } : { ok: false, reason: 'no_profile' });
  mocks.updateProfile.mockImplementation(async (_token: string, details: Record<string, unknown>) => ({
    ok: true,
    profile: profile({ ...details, senderName: details['firstName'] ?? null }),
  }));
  mocks.loadClerk.mockResolvedValue(fakeClerk({ userId: 'u1', names }).load);
}

beforeEach(() => {
  mocks.auth = false;
  mocks.loadClerk.mockReset();
  mocks.getProfile.mockReset();
  mocks.updateProfile.mockReset();
  window.localStorage.clear();
});

describe('landing and names (#603 1)', () => {
  it('a new sign-up lands on Overview, not the name screen, and saves the Clerk names once', async () => {
    signedIn({ firstName: 'Anna', lastName: 'Reyes' });
    render(<App />);
    expect(await h1('Overview')).toBeInTheDocument();
    await waitFor(() => expect(mocks.updateProfile).toHaveBeenCalledTimes(1));
    expect(mocks.updateProfile).toHaveBeenCalledWith('tok', { firstName: 'Anna', lastName: 'Reyes' });
    expect(screen.queryByRole('heading', { name: 'What should we call you?' })).not.toBeInTheDocument();
    expect(screen.queryByText(NAME_NOTE)).not.toBeInTheDocument();
  });

  it('does not overwrite names the profile already has', async () => {
    signedIn({ firstName: 'Anna', lastName: 'Reyes' }, { firstName: 'Ann', lastName: null, senderName: 'Ann' });
    render(<App />);
    await h1('Overview');
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(mocks.updateProfile).not.toHaveBeenCalled();
  });

  it('with no first name anywhere, Overview shows one calm line with a link to Account', async () => {
    signedIn({ firstName: null, lastName: null });
    const user = userEvent.setup();
    render(<App />);
    await h1('Overview');
    const note = await screen.findByText((_, node) => node?.tagName === 'P' && node.textContent === NAME_NOTE);
    expect(mocks.updateProfile).not.toHaveBeenCalled();
    await user.click(within(note).getByRole('button', { name: 'Account' }));
    expect(await h1('Account')).toBeInTheDocument();
  });

  it('shows the same line on a person\'s Overview', async () => {
    signedIn(undefined);
    seed(person('s1', 'Margaret Hayes', '2026-10-10T00:00:00.000Z'));
    render(<App />);
    await h1('Overview');
    expect(await screen.findByText((_, node) => node?.tagName === 'P' && node.textContent === NAME_NOTE)).toBeInTheDocument();
  });
});

describe('Account page (#603 2)', () => {
  it('is titled Account with no name question and no Your people link', async () => {
    signedIn(undefined, { firstName: 'Anna', senderName: 'Anna' });
    const user = userEvent.setup();
    render(<App />);
    await h1('Overview');
    const nav = screen.getByRole('navigation', { name: /^Sections/ });
    await user.click(within(nav).getByRole('button', { name: 'Your account' }));
    expect(await h1('Account')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'What should we call you?' })).not.toBeInTheDocument();
    const main = screen.getByRole('main');
    expect(within(main).queryByRole('button', { name: 'Your people' })).not.toBeInTheDocument();
  });
});

describe('Overview and Your people with nobody saved (#603 3, 4, 5)', () => {
  it('Overview shows its own empty page and Your people shows another, in both directions', async () => {
    const user = userEvent.setup();
    render(<App />);
    await h1('Overview');
    expect(screen.getByText(/Nothing is here yet/)).toBeInTheDocument();
    expect(screen.queryByText('No one here yet.')).not.toBeInTheDocument();
    const nav = screen.getByRole('navigation', { name: 'Sections' });
    await user.click(within(nav).getByRole('button', { name: 'Your people' }));
    await h1('Your people');
    expect(screen.getByText('No one here yet.')).toBeInTheDocument();
    expect(screen.queryByText(/Nothing is here yet/)).not.toBeInTheDocument();
    await user.click(within(nav).getByRole('button', { name: 'Overview' }));
    await h1('Overview');
    expect(screen.getByText(/Nothing is here yet/)).toBeInTheDocument();
  });

  it('the nav shows the not-started circles for the four sections with nobody saved', async () => {
    render(<App />);
    await h1('Overview');
    const nav = screen.getByRole('navigation', { name: 'Sections' });
    expect(within(nav).getAllByRole('img', { name: 'Not started' })).toHaveLength(4);
    await userEvent.click(within(nav).getByRole('button', { name: 'Your people' }));
    await h1('Your people');
    expect(within(screen.getByRole('navigation', { name: 'Sections' })).getAllByRole('img', { name: 'Not started' })).toHaveLength(4);
  });

  it('"Start with someone I\'ve lost" opens The person from Overview', async () => {
    const user = userEvent.setup();
    render(<App />);
    await h1('Overview');
    await user.click(screen.getByRole('button', { name: CREATE }));
    expect(await h1('The person')).toBeInTheDocument();
  });

  it('"Start with someone I\'ve lost" opens The person from a section', async () => {
    const user = userEvent.setup();
    render(<App />);
    await h1('Overview');
    await user.click(within(screen.getByRole('navigation', { name: 'Sections' })).getByRole('button', { name: /^Service/ }));
    await h1('Service');
    await user.click(screen.getByRole('button', { name: CREATE }));
    expect(await h1('The person')).toBeInTheDocument();
  });

  it('"Start with someone I\'ve lost" opens The person from Your people', async () => {
    const user = userEvent.setup();
    render(<App />);
    await h1('Overview');
    await user.click(within(screen.getByRole('navigation', { name: 'Sections' })).getByRole('button', { name: 'Your people' }));
    await h1('Your people');
    await user.click(screen.getByRole('button', { name: CREATE }));
    expect(await h1('The person')).toBeInTheDocument();
  });
});

describe('side nav (#603 6)', () => {
  it('has no Change button and no name line, but the landmark keeps the name', async () => {
    seed(person('s1', 'Margaret Hayes', '2026-10-10T00:00:00.000Z'));
    render(<App />);
    await h1('Overview');
    expect(screen.queryByRole('button', { name: /Change/ })).not.toBeInTheDocument();
    const nav = screen.getByRole('navigation', { name: 'Sections for Margaret Hayes' });
    expect(nav.parentElement).not.toHaveTextContent('Margaret Hayes');
  });
});
