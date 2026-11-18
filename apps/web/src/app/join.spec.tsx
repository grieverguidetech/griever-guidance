/**
 * Joining from an invitation link (#128) on the real App (editor on), with a fake Clerk and a stubbed
 * api-client. No network. The flags are mocked so each test picks its setup.
 */
import { StrictMode } from 'react';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AcceptInviteResult } from '@griever/api-client';
import type { ClerkLoadResult } from '../lib/authClient';
import { JOIN_STORAGE_KEY, clearJoinToken } from '../lib/joinLink';
import { fakeClerk } from '../test-clerk';
import { renderApp } from '../test/renderApp';

const mocks = vi.hoisted(() => ({
  sharing: true,
  auth: true,
  joined: false,
  loadClerk: vi.fn<() => Promise<ClerkLoadResult>>(),
  getProfile: vi.fn(),
  getMembers: vi.fn(),
  acceptInvite: vi.fn(),
}));

vi.mock('../lib/features', () => ({
  get AUTH_ENABLED() {
    return mocks.auth;
  },
  get SHARING_ENABLED() {
    return mocks.sharing;
  },
  OBITUARY_DRAFTING_ENABLED: false,
  PAYMENTS_ENABLED: false,
}));
vi.mock('../lib/cmsFlag', () => ({ CMS_ENABLED: true }));
vi.mock('../lib/authClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/authClient')>();
  return { ...actual, loadClerk: mocks.loadClerk };
});
vi.mock('@griever/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@griever/api-client')>();
  return { ...actual, getProfile: mocks.getProfile, getMembers: mocks.getMembers, acceptInvite: mocks.acceptInvite };
});

import { App } from './app';

const TOKEN = 'Tk'.repeat(21) + 'x';
const LINK = `/join#t=${TOKEN}`;
const SIGN_IN_BUTTON = 'Sign in with the test provider';
const UNUSABLE = "This invitation can't be used";
const UNUSABLE_BODY = 'Ask the person who sent it for a new one.';
const CONFLICT = "This invitation can't be joined";
const JOINED = "You're helping Anna now.";
const MEMBER_EMPTY = "When someone adds you to help, the people you're helping will show here.";

function profile(accountType: 'owner' | 'member') {
  return {
    id: 'u1',
    senderName: 'Ben',
    contactSource: null,
    firstName: 'Ben',
    lastName: null,
    fullName: null,
    birthDate: null,
    address: null,
    accountType,
    createdAt: '2026-11-17T00:00:00.000Z',
    updatedAt: '2026-11-17T00:00:00.000Z',
  };
}

function useClerk(options: Parameters<typeof fakeClerk>[0] = {}) {
  const clerk = fakeClerk(options);
  mocks.loadClerk.mockResolvedValue(clerk.load);
  return clerk;
}

function accepts(result: AcceptInviteResult) {
  mocks.acceptInvite.mockImplementation(async () => {
    if (result.ok) {
      mocks.joined = true;
    }
    return result;
  });
}

const saved = () => window.localStorage.getItem(JOIN_STORAGE_KEY);
/** A link saved on an earlier load (the email-confirmation round trip). */
const saveToken = () => window.localStorage.setItem(JOIN_STORAGE_KEY, JSON.stringify({ token: TOKEN, savedAt: Date.now() - 60_000 }));

/** Everything the app sent out or showed: the token must be in none of it. */
function expectTokenNowhere() {
  expect(window.location.href).not.toContain(TOKEN);
  expect(document.body.textContent).not.toContain(TOKEN);
  for (const call of mocks.getProfile.mock.calls.concat(mocks.getMembers.mock.calls)) {
    expect(JSON.stringify(call)).not.toContain(TOKEN);
  }
}

let fetchSpy: ReturnType<typeof vi.spyOn>;
let logSpies: ReturnType<typeof vi.spyOn>[];

beforeEach(() => {
  mocks.sharing = true;
  mocks.auth = true;
  mocks.joined = false;
  clearJoinToken();
  window.localStorage.clear();
  window.sessionStorage.clear();
  for (const m of [mocks.loadClerk, mocks.getProfile, mocks.getMembers, mocks.acceptInvite]) {
    m.mockReset();
  }
  mocks.getProfile.mockImplementation(async () => ({ ok: true, profile: profile(mocks.joined ? 'member' : 'owner') }));
  mocks.getMembers.mockImplementation(async () => ({
    ok: true,
    view: mocks.joined ? { role: 'member', owner: { id: 'o1', name: 'Anna' } } : { role: 'owner', members: [], invites: [] },
  }));
  accepts({ ok: true, ownerId: 'o1' });
  // Nothing in this suite may reach the network; a request URL holding the token would show here.
  fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('no network in tests'));
  logSpies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((level) => vi.spyOn(console, level));
});

afterEach(() => {
  for (const call of fetchSpy.mock.calls) {
    expect(String(call[0])).not.toContain(TOKEN);
  }
  for (const spy of logSpies) {
    expect(JSON.stringify(spy.mock.calls)).not.toContain(TOKEN);
    spy.mockRestore();
  }
  fetchSpy.mockRestore();
});

describe('signed out, flags on', () => {
  it('shows Join with the token out of the address bar, then signs up and joins once as a member', async () => {
    useClerk();
    const user = userEvent.setup();
    renderApp(<App />, { path: LINK });
    const heading = await screen.findByRole('heading', { level: 1, name: "You've been asked to help" });
    await waitFor(() => expect(heading).toHaveFocus());
    expect(window.location.pathname).toBe('/join');
    expect(window.location.hash).toBe('');
    expect(saved()).toContain(TOKEN);
    expectTokenNowhere();

    await user.click(screen.getByRole('button', { name: 'Create an account' }));
    expect(window.location.pathname).toBe('/sign-in');
    expect(window.location.search).toBe('?next=%2Fjoin');
    expect(mocks.acceptInvite).not.toHaveBeenCalled();
    await user.click(await screen.findByRole('button', { name: SIGN_IN_BUTTON }));

    expect(await screen.findByText(MEMBER_EMPTY)).toBeInTheDocument();
    expect(window.location.pathname).toBe('/people');
    expect(mocks.acceptInvite).toHaveBeenCalledTimes(1);
    expect(mocks.acceptInvite).toHaveBeenCalledWith('tok', TOKEN);
    expect(screen.queryByRole('button', { name: "Start with someone I've lost" })).toBeNull();
    expect(saved()).toBeNull();
    expectTokenNowhere();
  });

  it('"I already have an account" goes to the same sign-in, coming back to /join', async () => {
    useClerk();
    const user = userEvent.setup();
    renderApp(<App />, { path: LINK });
    await user.click(await screen.findByRole('button', { name: 'I already have an account' }));
    expect(`${window.location.pathname}${window.location.search}`).toBe('/sign-in?next=%2Fjoin');
    expect(window.sessionStorage.getItem('gg.signin.next.v1')).toBe('/join');
    expect(JSON.stringify(window.sessionStorage)).not.toContain(TOKEN);
  });

  it('ignores a token in the query string: no Join screen, nothing saved', async () => {
    useClerk();
    renderApp(<App />, { path: `/join?t=${TOKEN}` });
    expect(await screen.findByRole('button', { name: SIGN_IN_BUTTON })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: "You've been asked to help" })).toBeNull();
    expect(saved()).toBeNull();
    expect(window.location.pathname).toBe('/sign-in');
  });
});

describe('signed in, flags on', () => {
  it('already signed in when the link opens: accepts once, opens Your people and says whose', async () => {
    useClerk({ userId: 'u1' });
    renderApp(<App />, { path: LINK });
    expect(await screen.findByText(MEMBER_EMPTY)).toBeInTheDocument();
    expect(mocks.acceptInvite).toHaveBeenCalledTimes(1);
    expect(mocks.acceptInvite).toHaveBeenCalledWith('tok', TOKEN);
    expect(window.location.pathname).toBe('/people');
    const note = await screen.findByText(JOINED);
    expect(note.closest('[role="status"]')).toHaveAttribute('aria-live', 'polite');
    expect(note.textContent).not.toContain('!');
    expectTokenNowhere();
  });

  it('accepts exactly once under StrictMode (effects run twice there)', async () => {
    useClerk({ userId: 'u1' });
    renderApp(
      <StrictMode>
        <App />
      </StrictMode>,
      { path: LINK },
    );
    expect(await screen.findByText(MEMBER_EMPTY)).toBeInTheDocument();
    await screen.findByText(JOINED);
    expect(mocks.acceptInvite).toHaveBeenCalledTimes(1);
  });

  it('after the email-confirmation round trip, a later load on / still joins with the saved link', async () => {
    saveToken();
    useClerk({ userId: 'u1' });
    renderApp(<App />, { path: '/' });
    expect(await screen.findByText(MEMBER_EMPTY)).toBeInTheDocument();
    expect(window.location.pathname).toBe('/people');
    expect(mocks.acceptInvite).toHaveBeenCalledTimes(1);
    expect(mocks.acceptInvite).toHaveBeenCalledWith('tok', TOKEN);
    expect(saved()).toBeNull();
  });

  it('on a deep link, accepts in place and keeps the page', async () => {
    saveToken();
    useClerk({ userId: 'u1' });
    renderApp(<App />, { path: '/account' });
    expect(await screen.findByText(JOINED)).toBeInTheDocument();
    expect(window.location.pathname).toBe('/account');
    expect(mocks.acceptInvite).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Joining…')).toBeNull();
    expect(saved()).toBeNull();
  });

  it('already a member (joined on an earlier load): drops the link quietly, without asking the server to join', async () => {
    mocks.joined = true;
    saveToken();
    useClerk({ userId: 'u1' });
    renderApp(<App />, { path: LINK });
    expect(await screen.findByText(MEMBER_EMPTY)).toBeInTheDocument();
    await waitFor(() => expect(saved()).toBeNull());
    expect(mocks.acceptInvite).not.toHaveBeenCalled();
    expect(screen.queryByRole('heading', { name: UNUSABLE })).toBeNull();
    expect(screen.queryByRole('heading', { name: CONFLICT })).toBeNull();
  });

  it.each(['conflict', 'unusable'] as const)('a %s answer for an account that turns out to be a member already: no failure screen, link dropped', async (reason) => {
    mocks.acceptInvite.mockImplementation(async () => {
      mocks.joined = true;
      return { ok: false, reason };
    });
    useClerk({ userId: 'u1' });
    renderApp(<App />, { path: LINK });
    await waitFor(() => expect(saved()).toBeNull());
    await waitFor(() => expect(window.location.pathname).not.toBe('/join'));
    expect(screen.queryByRole('heading', { name: UNUSABLE })).toBeNull();
    expect(screen.queryByRole('heading', { name: CONFLICT })).toBeNull();
    expect(mocks.acceptInvite).toHaveBeenCalledTimes(1);
  });

  it.each(['unusable', 'invalid', 'forbidden'] as const)(
    'a dead link (%s) shows the one calm message, clears the token, and Continue opens the app',
    async (reason) => {
      accepts({ ok: false, reason });
      useClerk({ userId: 'u1' });
      const user = userEvent.setup();
      renderApp(<App />, { path: LINK });
      const heading = await screen.findByRole('heading', { level: 1, name: UNUSABLE });
      await waitFor(() => expect(heading).toHaveFocus());
      expect(screen.getByText(UNUSABLE_BODY)).toBeInTheDocument();
      expect(saved()).toBeNull();
      await user.click(screen.getByRole('button', { name: 'Continue' }));
      await waitFor(() => expect(window.location.pathname).not.toBe('/join'));
      expect(screen.queryByRole('heading', { name: UNUSABLE })).toBeNull();
      expect(mocks.acceptInvite).toHaveBeenCalledTimes(1);
      expect(document.body.textContent).not.toContain('!');
    },
  );

  it('conflict (this account has people of its own): its own message, and the token is cleared', async () => {
    accepts({ ok: false, reason: 'conflict' });
    useClerk({ userId: 'u1' });
    renderApp(<App />, { path: LINK });
    const heading = await screen.findByRole('heading', { level: 1, name: CONFLICT });
    await waitFor(() => expect(heading).toHaveFocus());
    expect(screen.getByText("You already have people you're helping, so this invitation can't be joined from this account.")).toBeInTheDocument();
    expect(saved()).toBeNull();
  });

  it.each(['unavailable', 'rate_limited', 'signed_out', 'failed'] as const)('%s: keeps the link and says to try again later', async (reason) => {
    accepts({ ok: false, reason });
    useClerk({ userId: 'u1' });
    const user = userEvent.setup();
    renderApp(<App />, { path: LINK });
    const heading = await screen.findByRole('heading', { level: 1, name: "Joining isn't available right now" });
    await waitFor(() => expect(heading).toHaveFocus());
    expect(saved()).toContain(TOKEN);
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => expect(window.location.pathname).not.toBe('/join'));
    expect(saved()).toContain(TOKEN);
  });

  it('offline: keeps the link and says so', async () => {
    accepts({ ok: false, reason: 'offline' });
    useClerk({ userId: 'u1' });
    const user = userEvent.setup();
    renderApp(<App />, { path: LINK });
    const heading = await screen.findByRole('heading', { level: 1, name: 'You need a connection to join' });
    await waitFor(() => expect(heading).toHaveFocus());
    expect(screen.getByText("Your link is saved. Open the app again when you're connected.")).toBeInTheDocument();
    expect(saved()).toContain(TOKEN);
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => expect(window.location.pathname).not.toBe('/join'));
    expect(mocks.acceptInvite).toHaveBeenCalledTimes(1);
    expect(saved()).toContain(TOKEN);
  });
});

describe('no answer', () => {
  it('after 15 seconds keeps the link and says so, so Joining never holds the app (C5)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      mocks.acceptInvite.mockReturnValue(new Promise(() => {}));
      useClerk({ userId: 'u1' });
      renderApp(<App />, { path: LINK });
      expect(await screen.findByText('Joining…')).toBeInTheDocument();
      await vi.advanceTimersByTimeAsync(15000);
      expect(await screen.findByRole('heading', { level: 1, name: 'You need a connection to join' })).toBeInTheDocument();
      expect(saved()).toContain(TOKEN);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('flags off', () => {
  it.each([
    ['sharing off', { auth: true, sharing: false }],
    ['accounts off', { auth: false, sharing: true }],
  ])('%s: the token is discarded and the normal app shows', async (_label, flags) => {
    mocks.auth = flags.auth;
    mocks.sharing = flags.sharing;
    useClerk();
    renderApp(<App />, { path: LINK });
    await waitFor(() => expect(window.location.pathname).not.toBe('/join'));
    expect(screen.queryByRole('heading', { name: "You've been asked to help" })).toBeNull();
    expect(saved()).toBeNull();
    expect(mocks.acceptInvite).not.toHaveBeenCalled();
    expectTokenNowhere();
  });
});
