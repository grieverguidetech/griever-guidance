import { act, renderHook } from '@testing-library/react';
import type { Session } from './useSessions.js';
import { useSessions } from './useSessions.js';

const FLOW_A = '11111111-1111-4111-8111-111111111111';
const FLOW_B = '22222222-2222-4222-8222-222222222222';
const FLOW_LOCAL = '33333333-3333-4333-8333-333333333333';

const person = (over: Partial<Session>): Partial<Session> => ({
  id: `local-${over.flowId}`,
  personName: 'Joan',
  dateOfPassing: '',
  senderName: '',
  obituaryUrl: '',
  serviceReady: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  lastOpenedAt: '2026-01-01T00:00:00.000Z',
  drafts: {},
  recipientsNotified: {},
  momentCompletedAt: {},
  remindersScheduled: [],
  ...over,
});

const mem = () => {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  };
};

const names = (list: Session[]) => list.map((s) => s.personName).sort();

function open(storage: ReturnType<typeof mem>, userId: string | null) {
  return renderHook(({ id }) => useSessions(storage, id), { initialProps: { id: userId } });
}

describe('useSessions across accounts on one device', () => {
  it('never shows account A people to account B, and gives them back to A', () => {
    const storage = mem();
    storage.data.set(
      'gg.sessions.v1',
      JSON.stringify([
        person({ flowId: FLOW_A, personName: 'Mine', ownerId: 'user_a', role: 'owner' }),
        person({ flowId: FLOW_B, personName: 'Shared', ownerId: 'user_other', role: 'member' }),
      ]),
    );
    storage.data.set('gg.sessionsAccount.v1', 'user_a');

    const first = open(storage, 'user_a');
    expect(names(first.result.current.sessions)).toEqual(['Mine', 'Shared']);
    first.unmount();

    const asB = open(storage, 'user_b');
    expect(asB.result.current.sessions).toEqual([]);
    expect(storage.data.get('gg.sessions.v1')).not.toContain('Mine');
    expect(storage.data.get('gg.sessions.v1')).not.toContain('Shared');
    asB.unmount();

    const backAsA = open(storage, 'user_a');
    expect(names(backAsA.result.current.sessions)).toEqual(['Mine', 'Shared']);
  });

  it('keeps people when the same account signs in again', () => {
    const storage = mem();
    storage.data.set(
      'gg.sessions.v1',
      JSON.stringify([person({ flowId: FLOW_A, personName: 'Mine', ownerId: 'user_a', role: 'owner' })]),
    );
    storage.data.set('gg.sessionsAccount.v1', 'user_a');
    const view = open(storage, 'user_a');
    expect(names(view.result.current.sessions)).toEqual(['Mine']);
    view.rerender({ id: null });
    view.rerender({ id: 'user_a' });
    expect(names(view.result.current.sessions)).toEqual(['Mine']);
  });

  it('works signed out and adopts local-only people at the first sign-in', () => {
    const storage = mem();
    storage.data.set(
      'gg.sessions.v1',
      JSON.stringify([person({ flowId: FLOW_LOCAL, personName: 'Local', ownerId: null, role: 'owner' })]),
    );
    const view = open(storage, null);
    expect(names(view.result.current.sessions)).toEqual(['Local']);
    view.rerender({ id: 'user_a' });
    expect(names(view.result.current.sessions)).toEqual(['Local']);
    expect(storage.data.get('gg.sessionsAccount.v1')).toBe('user_a');
  });

  it("treats unstamped local-only people as the marker account's when another account signs in", () => {
    const storage = mem();
    storage.data.set(
      'gg.sessions.v1',
      JSON.stringify([
        person({ flowId: FLOW_A, personName: 'Mine', ownerId: 'user_a', role: 'owner' }),
        person({ flowId: FLOW_LOCAL, personName: 'Local', ownerId: null, role: 'owner' }),
      ]),
    );
    storage.data.set('gg.sessionsAccount.v1', 'user_a');
    const view = open(storage, 'user_b');
    expect(view.result.current.sessions).toEqual([]);
    view.unmount();
    expect(names(open(storage, 'user_a').result.current.sessions)).toEqual(['Local', 'Mine']);
  });

  it('recognises the previous account on a device from before the marker existed', () => {
    const storage = mem();
    storage.data.set(
      'gg.sessions.v1',
      JSON.stringify([person({ flowId: FLOW_A, personName: 'Mine', ownerId: 'user_a', role: 'owner' })]),
    );
    const view = open(storage, 'user_b');
    expect(view.result.current.sessions).toEqual([]);
    view.rerender({ id: 'user_a' });
    expect(names(view.result.current.sessions)).toEqual(['Mine']);
  });

  it('hides a person A made and never synced (ownerId null) from B, and returns it to A', () => {
    const storage = mem();
    const asA = open(storage, 'user_a');
    act(() => void asA.result.current.createSession({ personName: 'A private' }));
    expect(asA.result.current.sessions[0]?.heldFor).toBe('user_a');
    asA.unmount();
    const asB = open(storage, 'user_b');
    expect(asB.result.current.sessions).toEqual([]);
    expect(storage.data.get('gg.sessions.v1')).not.toContain('A private');
    asB.unmount();
    const backAsA = open(storage, 'user_a');
    expect(names(backAsA.result.current.sessions)).toEqual(['A private']);
  });

  it('shows B nothing of A on the very first render', () => {
    const storage = mem();
    storage.data.set(
      'gg.sessions.v1',
      JSON.stringify([person({ flowId: FLOW_A, personName: 'Mine', ownerId: null, heldFor: 'user_a', role: 'owner' })]),
    );
    storage.data.set('gg.sessionsAccount.v1', 'user_a');
    const asB = open(storage, 'user_b');
    expect(asB.result.current.sessions).toEqual([]);
    expect(asB.result.current.heldFor).toBe('user_b');
  });

  it('hides A from B in the render where B arrives, before the swap settles', () => {
    const storage = mem();
    storage.data.set(
      'gg.sessions.v1',
      JSON.stringify([person({ flowId: FLOW_A, personName: 'Mine', ownerId: null, heldFor: 'user_a', role: 'owner' })]),
    );
    storage.data.set('gg.sessionsAccount.v1', 'user_a');
    const seen: string[][] = [];
    const view = renderHook(({ id }) => {
      const r = useSessions(storage, id);
      seen.push(names(r.sessions));
      return r;
    }, { initialProps: { id: null as string | null } });
    seen.length = 0;
    view.rerender({ id: 'user_b' });
    expect(seen.every((list) => list.length === 0)).toBe(true);
  });

  it('sets aside shared people on a legacy device with no marker, and keeps local-only people', () => {
    const storage = mem();
    storage.data.set(
      'gg.sessions.v1',
      JSON.stringify([
        person({ flowId: FLOW_B, personName: 'Shared', ownerId: 'user_other', role: 'member' }),
        person({ flowId: FLOW_LOCAL, personName: 'Local', ownerId: null, role: 'owner' }),
      ]),
    );
    const asB = open(storage, 'user_b');
    expect(names(asB.result.current.sessions)).toEqual(['Local']);
    expect(storage.data.get('gg.sessions.v1')).not.toContain('Shared');
  });

  it('keeps three accounts apart: A, B, C, then A again', () => {
    const storage = mem();
    for (const [id, name] of [['user_a', 'A one'], ['user_b', 'B one'], ['user_c', 'C one']] as const) {
      const view = open(storage, id);
      act(() => void view.result.current.createSession({ personName: name }));
      expect(names(view.result.current.sessions)).toEqual([name]);
      view.unmount();
    }
    const again = open(storage, 'user_a');
    expect(names(again.result.current.sessions)).toEqual(['A one']);
  });
});
