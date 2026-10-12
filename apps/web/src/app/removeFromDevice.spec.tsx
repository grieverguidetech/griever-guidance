/**
 * #51: "Remove everything from this device" lives in settings only (C9). Real App, real hooks,
 * in-memory IndexedDB. Confirming empties every store; keeping empties none; nothing is sent.
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { contactStore, openDb, outboxStore, sendJobStore, accountStore, metaStore } from '@griever/data-local';
import { App } from './app';

type User = ReturnType<typeof userEvent.setup>;

const OTHER_KEYS = ['gg.profile.v1', 'gg.activeSessionId', 'gg.userId', 'gg.sendflow.v1', 'sb-demo-auth-token'];
const REMOVE = 'Remove everything from this device';

async function reachPathLanding(user: User) {
  await user.type(screen.getByLabelText('Name'), 'Aunt Carol');
  await user.type(screen.getByLabelText('Mobile number'), '6175550148');
  await user.click(screen.getByRole('button', { name: 'Add and start another' }));
  await screen.findByText('Added so far — 1');
  await user.click(screen.getByRole('button', { name: 'Done for now' }));
  await user.click(screen.getByRole('button', { name: 'Save and continue' }));
  await user.type(screen.getByLabelText('Their name'), 'Margaret Hayes');
  await user.click(screen.getByRole('button', { name: 'Continue' }));
  await screen.findByRole('heading', { name: 'One thing at a time.' });
}

/** Puts something in every IndexedDB store and every localStorage key we own, plus one key we do not. */
async function fillEveryStore() {
  const db = await openDb();
  await db.put('sessions', { sessionId: 's1' } as never);
  await outboxStore.add({
    sessionId: 's1',
    type: 'session.upsert',
    patch: {},
    baseUpdatedAt: 0,
    createdAt: 1,
    attempts: 0,
  });
  await sendJobStore.put({ jobId: 'j1', sessionId: 's1', recipients: [], createdAt: 1 });
  await accountStore.setSenderName('Sam');
  await metaStore.setMetaString('deviceId', 'dev-1');
  for (const key of OTHER_KEYS) window.localStorage.setItem(key, '{"refresh_token":"x"}');
  window.localStorage.setItem('unrelated', 'keep');
}

async function snapshot() {
  const db = await openDb();
  return {
    contacts: (await contactStore.list()).length,
    sessions: (await db.getAll('sessions')).length,
    outbox: (await outboxStore.list()).length,
    sendJobs: (await db.getAll('sendJobs')).length,
    account: (await db.getAll('account')).length,
    // The app itself writes a blank devUserId on every start, so look for what we seeded.
    deviceId: await metaStore.getMetaString('deviceId'),
  };
}

async function openRemoveConfirm(user: User) {
  await user.click(screen.getByRole('button', { name: 'Settings' }));
  await user.click(screen.getByRole('button', { name: REMOVE }));
}

describe('remove everything from this device (#51)', () => {
  it('confirming empties every store and returns to the first screen', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const user = userEvent.setup();
    render(<App />);
    await reachPathLanding(user);
    await fillEveryStore();
    expect(await snapshot()).toEqual({ contacts: 1, sessions: 1, outbox: 1, sendJobs: 1, account: 1, deviceId: 'dev-1' });
    expect(window.localStorage.getItem('gg.sessions.v1')).not.toBeNull();

    await openRemoveConfirm(user);
    expect(
      screen.getByText(
        "This removes the people you're writing about, your contacts, and your drafts from this device. It can't be undone. Nothing is removed from anyone else's phone.",
      ),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Remove everything' }));

    expect(await screen.findByText('Everything has been removed from this device.')).toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toBeInTheDocument(); // the first screen: adding contacts
    expect(await snapshot()).toEqual({ contacts: 0, sessions: 0, outbox: 0, sendJobs: 0, account: 0, deviceId: null });
    // The fresh start may write an empty list back, but nothing of ours is left in it.
    expect(JSON.parse(window.localStorage.getItem('gg.sessions.v1') ?? '[]')).toEqual([]);
    for (const key of OTHER_KEYS) expect(window.localStorage.getItem(key), key).toBeNull();
    // Only our own keys are touched.
    expect(window.localStorage.getItem('unrelated')).toBe('keep');
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('keeping everything clears nothing', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const user = userEvent.setup();
    render(<App />);
    await reachPathLanding(user);
    await fillEveryStore();
    const sessionsJson = window.localStorage.getItem('gg.sessions.v1');

    await openRemoveConfirm(user);
    await user.click(screen.getByRole('button', { name: 'Keep everything' }));

    expect(screen.getByRole('button', { name: REMOVE })).toBeInTheDocument();
    expect(await snapshot()).toEqual({ contacts: 1, sessions: 1, outbox: 1, sendJobs: 1, account: 1, deviceId: 'dev-1' });
    expect(window.localStorage.getItem('gg.sessions.v1')).toBe(sessionsJson);
    for (const key of OTHER_KEYS) expect(window.localStorage.getItem(key), key).not.toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('is not offered inside the flow screens', async () => {
    const user = userEvent.setup();
    render(<App />);
    await reachPathLanding(user);
    expect(screen.getByRole('button', { name: 'Settings' })).toBeInTheDocument(); // the path is not a flow

    await user.click(screen.getByRole('button', { name: 'Start' }));
    await screen.findByRole('button', { name: 'Continue' });
    expect(screen.queryByRole('button', { name: 'Settings' })).not.toBeInTheDocument();
    expect(screen.queryByText(/remove everything/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /remove|delete/i })).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Continue' })).toBeInTheDocument());
  });
});
