import { renderHook } from '@testing-library/react';
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

  it('keeps unsynced local-only people when a different account signs in, and hides the old account people', () => {
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
    expect(names(view.result.current.sessions)).toEqual(['Local']);
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
});
