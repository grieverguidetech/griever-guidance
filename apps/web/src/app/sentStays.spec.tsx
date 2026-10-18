/**
 * #167: after Done on the last person, the Sent screen stays, and "Back to home" opens Home.
 * The real App, signed in with a stub auth client (no network, no supabase-js).
 *
 * The bounce: when the flow is mounted again while its moment is mid-send or at 'sent', the app
 * used to hand the flow no draft, so it started over on the template picker. The one path that
 * remounts it today: the account's name check answers late, the "What should we call you?" prompt
 * interrupts, and Save returns to the flow. (Supabase's own token refresh on tab focus does not:
 * the identity hook never goes back to loading and does not listen for auth events.)
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AuthClient, ProfileResult } from '@griever/api-client/auth';
import type { AuthClientResult } from '../lib/authClient';

const mocks = vi.hoisted(() => ({
  load: vi.fn<() => Promise<AuthClientResult>>(),
}));
vi.mock('../lib/features', () => ({ AUTH_ENABLED: true, OBITUARY_DRAFTING_ENABLED: false }));
vi.mock('../lib/authClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/authClient')>();
  return { ...actual, loadAuthClient: mocks.load };
});

import { App } from './app';

const PROFILE = {
  id: 'u1',
  senderName: null as string | null,
  contactSource: null,
  accountType: 'owner' as const,
  createdAt: '2026-10-11T00:00:00.000Z',
  updatedAt: '2026-10-11T00:00:00.000Z',
};

const note = 'She was peaceful and we were with her at the end.';
const NAME_CHECK_FALLBACK_MS = 5000;

/** A signed-in client whose profile answers only when `answerProfile` is called. */
function signedInClient(profile: Promise<ProfileResult>): AuthClient {
  return {
    signUp: vi.fn(),
    signIn: vi.fn(),
    signOut: vi.fn(async () => ({ ok: true as const, serverRevoked: true })),
    getSession: vi.fn(async () => ({
      status: 'signed_in' as const,
      session: { userId: 'u1', email: 'a@b.co', accessToken: 't' },
    })),
    refreshSession: vi.fn(async () => ({ status: 'signed_out' as const })),
    getProfile: vi.fn(() => profile),
    updateProfile: vi.fn(async (update: { senderName?: string }) => ({
      ok: true as const,
      profile: { ...PROFILE, senderName: update.senderName ?? null },
    })),
  } as unknown as AuthClient;
}

/** From Home to the Sending step for one person. */
async function toSending(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: "Start with someone I've lost" }));
  await user.type(screen.getByLabelText('Their name'), 'Margaret Hayes');
  await user.click(screen.getByRole('button', { name: 'Continue' }));
  await user.type(screen.getByLabelText('Name'), 'Aunt Carol');
  await user.type(screen.getByLabelText('Mobile number'), '6175550148');
  await user.click(screen.getByRole('button', { name: 'Add and start another' }));
  await screen.findByText('Added so far — 1');
  await user.click(screen.getByRole('button', { name: 'Done for now' }));
  await user.click(screen.getByRole('button', { name: 'Save and continue' }));
  await user.click(screen.getByRole('button', { name: 'Start' }));
  await user.type(screen.getByLabelText(/Anything you'd like to add/), note);
  await user.click(screen.getByRole('button', { name: 'Continue' }));
  await user.click(screen.getByRole('button', { name: /Not yet/ }));
  await user.click(screen.getByRole('button', { name: 'Continue' }));
  await user.click(await screen.findByRole('button', { name: /Aunt Carol/ }));
  await user.click(screen.getByRole('button', { name: 'Continue' }));
  await user.click(screen.getByRole('button', { name: /^Text 1 person/ }));
  await screen.findByRole('heading', { level: 1, name: 'Reaching people, one at a time' });
}

async function sendAnAnnouncement(user: ReturnType<typeof userEvent.setup>) {
  await toSending(user);
  await user.click(screen.getByRole('button', { name: 'Open Messages' }));
  await user.click(screen.getByRole('button', { name: 'Done' }));
}

/** The name check answers now with no name: the prompt interrupts, and Save returns to the flow. */
async function nameCheckInterrupts(user: ReturnType<typeof userEvent.setup>, answer: (r: ProfileResult) => void) {
  answer({ ok: true, profile: PROFILE });
  await screen.findByRole('heading', { level: 1, name: 'What should we call you?' });
  await user.type(screen.getByLabelText('Your name'), 'Anna');
  await user.click(screen.getByRole('button', { name: 'Save' }));
}

function lateProfile() {
  let answer: (result: ProfileResult) => void = () => undefined;
  const profile = new Promise<ProfileResult>((resolve) => {
    answer = resolve;
  });
  return { profile, answer: (result: ProfileResult) => answer(result) };
}

beforeEach(() => {
  window.localStorage.clear();
  mocks.load.mockReset();
  // jsdom can't follow the sms: link; the hand-off itself is not under test here.
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  // The name check gives up after 5 s and counts as "has a name". Under a slow CI run the
  // journey can take longer than that, so only that one 5 s fallback is held back and the test
  // decides when the answer arrives. Every other timer runs as normal.
  const realSetTimeout = globalThis.setTimeout;
  vi.spyOn(globalThis, 'setTimeout').mockImplementation(((fn: () => void, ms?: number, ...args: unknown[]) =>
    ms === NAME_CHECK_FALLBACK_MS
      ? (0 as unknown as ReturnType<typeof setTimeout>)
      : realSetTimeout(fn, ms, ...args)) as typeof setTimeout);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('after Done on the last person (#167)', () => {
  it('stays on Sent when the flow is opened again, and keeps no wording', async () => {
    const { profile, answer } = lateProfile();
    mocks.load.mockResolvedValue({ available: true, client: signedInClient(profile) });
    const user = userEvent.setup();
    render(<App />);

    await sendAnAnnouncement(user);
    expect(await screen.findByRole('heading', { level: 1, name: 'Everyone has been told.' })).toBeInTheDocument();
    await nameCheckInterrupts(user, answer);

    // Back in the flow: still Sent, never the template picker. Skips aren't known now, so no number.
    expect(await screen.findByRole('heading', { level: 1, name: 'Everyone has been told.' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Announce the passing/ })).not.toBeInTheDocument();
    expect(screen.getByText(/The people you chose now know about Margaret Hayes/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add service details' })).toBeInTheDocument();
    // C2: what was written is not on screen and not saved.
    expect(screen.queryByText(new RegExp(note))).not.toBeInTheDocument();
    expect(JSON.stringify({ ...window.localStorage })).not.toContain('peaceful');
  }, 30_000); // a whole journey under load

  it('mid-send, comes back on Review when the flow is opened again, not the picker', async () => {
    const { profile, answer } = lateProfile();
    mocks.load.mockResolvedValue({ available: true, client: signedInClient(profile) });
    const user = userEvent.setup();
    render(<App />);

    await toSending(user);
    await nameCheckInterrupts(user, answer);

    // The send job is not saved, so the moment comes back one step earlier, with the list kept.
    expect(await screen.findByRole('heading', { level: 1, name: 'Read it once before it goes' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Text 1 person/ })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 1, name: 'What would you like to send?' })).not.toBeInTheDocument();
  }, 30_000);

  it('"Back to home" opens Home, the people list', async () => {
    mocks.load.mockResolvedValue({
      available: true,
      client: signedInClient(Promise.resolve({ ok: true, profile: { ...PROFILE, senderName: 'Anna' } })),
    });
    const user = userEvent.setup();
    render(<App />);

    await sendAnAnnouncement(user);
    await screen.findByRole('heading', { level: 1, name: 'Everyone has been told.' });
    await user.click(screen.getByRole('button', { name: 'Back to home' }));

    expect(await screen.findByRole('heading', { level: 1, name: "The people you're writing about" })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Margaret Hayes/ })).toBeInTheDocument();
    expect(JSON.stringify({ ...window.localStorage })).not.toContain('peaceful');
  }, 30_000);
});
