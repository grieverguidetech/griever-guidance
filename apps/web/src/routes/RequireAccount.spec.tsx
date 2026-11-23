/**
 * The sign-in guard (#851): the pure rule, then each mode on the real App (editor on) with the fake
 * Clerk (src/test-clerk.tsx). The flags and the Clerk loader are mocked so each test picks its setup.
 */
import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ClerkLoadResult } from '../lib/authClient';
import { fakeClerk } from '../test-clerk';
import { renderApp } from '../test/renderApp';
import { SIGN_IN_NEXT_KEY, isAuthRoute, isSignInPath, rememberNext, rememberedNext, requireAccount } from './RequireAccount';
import type { AccountState } from './RequireAccount';

const mocks = vi.hoisted(() => ({
  auth: true,
  loadClerk: vi.fn<() => Promise<ClerkLoadResult>>(),
  getProfile: vi.fn(),
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
  return { ...actual, getProfile: mocks.getProfile };
});

import { App } from '../app/app';

const SIGN_IN_BUTTON = 'Sign in with the test provider';
const ENDED = "You've been signed out. Your work on this device is safe. Sign in again when you're ready.";
const NOT_REACHABLE = "Your account can't be reached right now. Your work on this device is here.";
const PAGE = '/people/f1/service';

describe('requireAccount', () => {
  const at = (path: string, account: AccountState) => {
    const [pathname, search = ''] = path.split('?');
    return requireAccount({ pathname, search: search ? `?${search}` : '', account });
  };

  it('sends a signed-out visitor on an auth route to sign-in with the path as next', () => {
    expect(at(PAGE, 'signed_out')).toBe('/sign-in?next=%2Fpeople%2Ff1%2Fservice');
    expect(at('/people', 'signed_out')).toBe('/sign-in?next=%2Fpeople');
    expect(at('/start/guide/officiant', 'signed_out')).toBe('/sign-in?next=%2Fstart%2Fguide%2Fofficiant');
    expect(at('/account', 'signed_out')).toBe('/sign-in?next=%2Faccount');
    expect(at('/', 'signed_out')).toBe('/sign-in');
  });

  it('lets everyone else stay on an auth route', () => {
    for (const account of ['off', 'local', 'loading', 'signed_in', 'stay'] as const) {
      expect(at(PAGE, account)).toBeNull();
    }
  });

  it('sends the Sign out button to a bare /sign-in', () => {
    expect(at('/account', 'left')).toBe('/sign-in');
  });

  it('leaves /join and unknown paths alone, signed in or not', () => {
    expect(at('/join', 'signed_out')).toBeNull();
    expect(at('/nope', 'signed_out')).toBeNull();
  });

  it('after sign-in goes to next, and a malformed next falls back to /', () => {
    expect(at('/sign-in?next=%2Fpeople%2Ff1', 'signed_in')).toBe('/people/f1');
    expect(at('/sign-in/factor-one?next=%2Faccount', 'signed_in')).toBe('/account');
    expect(at('/sign-in?next=%2Fpeople%2Ff1', 'local')).toBe('/people/f1');
    for (const next of ['https%3A%2F%2Fevil.example', '%2F%2Fevil.example', '%2Fsign-in', '%2Fsign-up', '%2Fnope', 'people']) {
      expect(at(`/sign-in?next=${next}`, 'signed_in')).toBe('/');
    }
    expect(at('/sign-in', 'signed_in')).toBe('/');
  });

  it('keeps the sign-in screen while signed out or loading', () => {
    expect(at('/sign-in?next=%2Fpeople', 'signed_out')).toBeNull();
    expect(at('/sign-in/factor-one', 'loading')).toBeNull();
  });

  it('sends /sign-up to /sign-in and keeps a safe next', () => {
    expect(at('/sign-up?next=%2Fpeople', 'signed_out')).toBe('/sign-in?next=%2Fpeople');
    expect(at('/sign-up?next=https%3A%2F%2Fevil.example', 'signed_out')).toBe('/sign-in');
  });

  it('with accounts off sends /sign-in and /sign-up to /', () => {
    expect(at('/sign-in?next=%2Fpeople', 'off')).toBe('/');
    expect(at('/sign-in/factor-one', 'off')).toBe('/');
    expect(at('/sign-up', 'off')).toBe('/');
  });

  it('after sign-in with no usable next in the URL, uses the remembered one', () => {
    const after = (search: string, remembered: string | null) => requireAccount({ pathname: '/sign-in/sso-callback', search, account: 'signed_in', remembered });
    expect(after('', '/people/f1/service')).toBe('/people/f1/service');
    expect(after('?next=%2Fnope', '/people/f1')).toBe('/people/f1');
    expect(after('?next=%2Faccount', '/people/f1')).toBe('/account');
    expect(after('', 'https://evil.example')).toBe('/');
    expect(after('', null)).toBe('/');
  });

  it('stores only a safeNext path, never "/" or anything else', () => {
    window.sessionStorage.clear();
    rememberNext('/people/f1/service');
    expect(window.sessionStorage.getItem(SIGN_IN_NEXT_KEY)).toBe('/people/f1/service');
    rememberNext('https://evil.example');
    expect(window.sessionStorage.getItem(SIGN_IN_NEXT_KEY)).toBeNull();
    rememberNext('/people/f1');
    rememberNext('/');
    expect(window.sessionStorage.getItem(SIGN_IN_NEXT_KEY)).toBeNull();
    // A value put there by hand is checked again on the way out.
    window.sessionStorage.setItem(SIGN_IN_NEXT_KEY, '//evil.example');
    expect(rememberedNext()).toBeNull();
    window.sessionStorage.clear();
  });

  it('knows its paths', () => {
    expect(isSignInPath('/sign-in')).toBe(true);
    expect(isSignInPath('/sign-in/create/verify')).toBe(true);
    expect(isSignInPath('/sign-inx')).toBe(false);
    expect(isAuthRoute('/start')).toBe(true);
    expect(isAuthRoute('/join')).toBe(false);
  });
});

function person(id: string, flowId: string, name: string) {
  return {
    id,
    flowId,
    personName: name,
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
  };
}

function h1(name: string) {
  return screen.findByRole('heading', { level: 1, name });
}

function useClerk(options?: Parameters<typeof fakeClerk>[0]) {
  const clerk = fakeClerk(options);
  mocks.loadClerk.mockResolvedValue(clerk.load);
  return clerk;
}

function here() {
  return window.location.pathname + window.location.search;
}

beforeEach(() => {
  mocks.auth = true;
  mocks.loadClerk.mockReset();
  mocks.getProfile.mockReset();
  mocks.getProfile.mockResolvedValue({ ok: false, reason: 'offline' });
  window.localStorage.clear();
  window.sessionStorage.clear();
  window.localStorage.setItem('gg.sessions.v1', JSON.stringify([person('s1', 'f1', 'Margaret Hayes')]));
  window.localStorage.setItem('gg.sessionsAccount.v1', 'u1');
});

describe('the guard on the App', () => {
  it('signed out on a person page: sign-in with next, then back on that page, with no new entries', async () => {
    useClerk();
    const user = userEvent.setup();
    renderApp(<App />, { path: PAGE });
    const entries = window.history.length;
    await user.click(await screen.findByRole('button', { name: SIGN_IN_BUTTON }));
    await h1('Service');
    expect(here()).toBe(PAGE);
    expect(window.history.length).toBe(entries);
  });

  it('a Clerk step before sign-in still returns to next, with no new entries', async () => {
    useClerk({ stepBeforeSignIn: '/sign-in/factor-one' });
    const user = userEvent.setup();
    renderApp(<App />, { path: PAGE });
    await screen.findByRole('button', { name: SIGN_IN_BUTTON });
    const entries = window.history.length;
    await user.click(screen.getByRole('button', { name: SIGN_IN_BUTTON }));
    await h1('Service');
    expect(here()).toBe(PAGE);
    expect(window.history.length).toBe(entries);
  });

  it('a sign-in that returns on a URL with no next (SSO, email link) still lands on the page', async () => {
    useClerk();
    const first = renderApp(<App />, { path: PAGE });
    await screen.findByRole('button', { name: SIGN_IN_BUTTON });
    expect(window.sessionStorage.getItem(SIGN_IN_NEXT_KEY)).toBe(PAGE);
    first.unmount();
    // The provider sends the browser back to a callback Clerk built itself: a new load, signed in.
    useClerk({ userId: 'u1' });
    renderApp(<App />, { path: '/sign-in/sso-callback' });
    await h1('Service');
    expect(here()).toBe(PAGE);
    expect(window.sessionStorage.getItem(SIGN_IN_NEXT_KEY)).toBeNull();
  });

  it('a bare /sign-in clears a remembered next', async () => {
    window.sessionStorage.setItem(SIGN_IN_NEXT_KEY, PAGE);
    useClerk();
    renderApp(<App />);
    await screen.findByRole('button', { name: SIGN_IN_BUTTON });
    expect(here()).toBe('/sign-in');
    expect(window.sessionStorage.getItem(SIGN_IN_NEXT_KEY)).toBeNull();
  });

  it('shows the sign-in screen at /sign-in?next=, replacing the entry', async () => {
    useClerk();
    const entries = window.history.length;
    renderApp(<App />, { path: '/people' });
    await screen.findByRole('button', { name: SIGN_IN_BUTTON });
    expect(here()).toBe('/sign-in?next=%2Fpeople');
    expect(window.history.length).toBe(entries);
  });

  it('signed out on / goes to a bare /sign-in, and sign-in lands on the Overview', async () => {
    useClerk();
    const user = userEvent.setup();
    renderApp(<App />);
    await user.click(await screen.findByRole('button', { name: SIGN_IN_BUTTON }));
    await h1('Overview');
    expect(window.location.pathname).toBe('/people/f1');
  });

  it('never copies a query or a fragment into next', async () => {
    useClerk();
    renderApp(<App />, { path: `${PAGE}?name=Margaret#t=abc` });
    await screen.findByRole('button', { name: SIGN_IN_BUTTON });
    expect(here()).toBe('/sign-in?next=%2Fpeople%2Ff1%2Fservice');
    expect(window.location.href).not.toContain('Margaret');
  });

  it('a malformed next falls back to / after sign-in', async () => {
    useClerk();
    const user = userEvent.setup();
    renderApp(<App />, { path: '/sign-in?next=https%3A%2F%2Fevil.example%2Fpeople' });
    await user.click(await screen.findByRole('button', { name: SIGN_IN_BUTTON }));
    await h1('Overview');
    expect(window.location.pathname).toBe('/people/f1');
  });

  it('/sign-up goes to /sign-in and keeps next', async () => {
    useClerk();
    renderApp(<App />, { path: '/sign-up?next=%2Faccount' });
    await screen.findByRole('button', { name: SIGN_IN_BUTTON });
    expect(here()).toBe('/sign-in?next=%2Faccount');
  });

  it('already signed in, /sign-in?next= goes straight on', async () => {
    useClerk({ userId: 'u1' });
    renderApp(<App />, { path: '/sign-in?next=%2Faccount' });
    await h1('Account');
    expect(here()).toBe('/account');
    expect(screen.queryByRole('button', { name: SIGN_IN_BUTTON })).toBeNull();
  });

  it('/join with sharing off drops the fragment and opens the normal app (#128; join.spec.tsx covers sharing on)', async () => {
    useClerk();
    renderApp(<App />, { path: `/join#t=${'A'.repeat(43)}` });
    await screen.findByRole('button', { name: SIGN_IN_BUTTON });
    expect(window.location.pathname).toBe('/sign-in');
    expect(window.location.hash).toBe('');
    expect(window.localStorage.getItem('gg.join.v1')).toBeNull();
  });

  it('a session that ends mid-use keeps the page and its note, with no redirect', async () => {
    const clerk = useClerk({ userId: 'u1' });
    renderApp(<App />, { path: PAGE });
    await h1('Service');
    act(() => clerk.endElsewhere());
    expect(await screen.findByText(ENDED)).toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(here()).toBe(PAGE);
    expect(screen.getByRole('heading', { level: 1, name: 'Service' })).toBeInTheDocument();
  });

  it('the note\'s Sign in goes to /sign-in with this page as next, and back after sign-in', async () => {
    const clerk = useClerk({ userId: 'u1' });
    const user = userEvent.setup();
    renderApp(<App />, { path: PAGE });
    await h1('Service');
    act(() => clerk.endElsewhere());
    await user.click(await screen.findByRole('button', { name: 'Sign in' }));
    await screen.findByRole('button', { name: SIGN_IN_BUTTON });
    expect(here()).toBe('/sign-in?next=%2Fpeople%2Ff1%2Fservice');
    expect(screen.queryByText(ENDED)).toBeNull();
    await user.click(screen.getByRole('button', { name: SIGN_IN_BUTTON }));
    await h1('Service');
    expect(here()).toBe(PAGE);
  });

  it('the Sign out button goes to a bare /sign-in', async () => {
    useClerk({ userId: 'u1' });
    const user = userEvent.setup();
    renderApp(<App />, { path: '/account' });
    await h1('Account');
    await user.click(screen.getByRole('button', { name: 'Sign out' }));
    await screen.findByRole('button', { name: SIGN_IN_BUTTON });
    expect(here()).toBe('/sign-in');
    expect(screen.queryByText(ENDED)).toBeNull();
  });

  it('offline local mode (Clerk unreachable, signed-in marker) lets the user in', async () => {
    mocks.loadClerk.mockResolvedValue({ available: false });
    window.localStorage.setItem('gg.signedIn.v1', 'u1');
    renderApp(<App />, { path: PAGE });
    await h1('Service');
    expect(await screen.findByText(NOT_REACHABLE)).toBeInTheDocument();
    expect(here()).toBe(PAGE);
  });

  it('offline local mode sends /sign-in?next= on to next', async () => {
    mocks.loadClerk.mockResolvedValue({ available: false });
    window.localStorage.setItem('gg.signedIn.v1', 'u1');
    renderApp(<App />, { path: '/sign-in?next=%2Fpeople%2Ff1%2Fservice' });
    await h1('Service');
    expect(here()).toBe(PAGE);
  });

  it('Back while signed in walks past Clerk\'s /sign-in/<step> entries', async () => {
    // Below: a page of a person who is here, then a sign-in and one of Clerk's steps.
    window.history.replaceState(null, '', '/people/f1');
    window.history.pushState(null, '', '/sign-in');
    window.history.pushState(null, '', '/sign-in/factor-one');
    window.history.pushState(null, '', '/account');
    useClerk({ userId: 'u1' });
    const user = userEvent.setup();
    renderApp(<App />, { path: '/account' });
    await h1('Account');
    await user.click(screen.getByRole('link', { name: "Who you've lost" }));
    await h1("Who you've lost");
    act(() => {
      window.history.back();
    });
    await h1('Account');
    const back = vi.spyOn(window.history, 'back');
    act(() => {
      window.history.back();
    });
    await waitFor(() => expect(back.mock.calls.length).toBeGreaterThanOrEqual(2));
    // Let the walk settle (it may go on through older entries of this jsdom tab).
    let seen = -1;
    while (seen !== back.mock.calls.length) {
      seen = back.mock.calls.length;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    expect(window.location.pathname).toBe('/people/f1');
    expect(await h1('Overview')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: SIGN_IN_BUTTON })).toBeNull();
    back.mockRestore();
  });
});

describe('focus after the guard moves (a11y)', () => {
  it('signing in from /sign-in?next=<person page> moves focus to that page\'s h1', async () => {
    useClerk();
    const user = userEvent.setup();
    renderApp(<App />, { path: '/sign-in?next=%2Fpeople%2Ff1%2Fservice' });
    await user.click(await screen.findByRole('button', { name: SIGN_IN_BUTTON }));
    const heading = await h1('Service');
    await waitFor(() => expect(heading).toHaveFocus());
  });

  it('the note\'s Sign in ends with the sign-in h1 focused', async () => {
    const clerk = useClerk({ userId: 'u1' });
    const user = userEvent.setup();
    renderApp(<App />, { path: PAGE });
    await h1('Service');
    act(() => clerk.endElsewhere());
    await user.click(await screen.findByRole('button', { name: 'Sign in' }));
    const heading = await h1('Grievers Guidance');
    await waitFor(() => expect(heading).toHaveFocus());
  });

  it('Sign out ends with the sign-in h1 focused', async () => {
    useClerk({ userId: 'u1' });
    const user = userEvent.setup();
    renderApp(<App />, { path: '/account' });
    await h1('Account');
    await user.click(screen.getByRole('button', { name: 'Sign out' }));
    const heading = await h1('Grievers Guidance');
    await waitFor(() => expect(heading).toHaveFocus());
  });
});

describe('accounts off', () => {
  beforeEach(() => {
    mocks.auth = false;
  });

  it('the guard is a pass-through on an auth route', async () => {
    renderApp(<App />, { path: PAGE });
    await h1('Service');
    expect(here()).toBe(PAGE);
    expect(mocks.loadClerk).not.toHaveBeenCalled();
  });

  it.each(['/sign-in?next=%2Fpeople', '/sign-in/factor-one', '/sign-up'])('%s goes to / (then the landing)', async (path) => {
    renderApp(<App />, { path });
    await h1('Overview');
    expect(window.location.pathname).toBe('/people/f1');
  });
});
