import { act, renderHook } from '@testing-library/react';
import { toFlowFacts } from '@griever/shared';
import type { SendFlowStorage } from './useSendFlow.js';
import { useSessions } from './useSessions.js';
import type { Session } from './useSessions.js';

const KEY = 'gg.sessions.v1';

function mem(initial: unknown[]) {
  const map = new Map<string, string>([[KEY, JSON.stringify(initial)]]);
  const storage: SendFlowStorage = {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  };
  return { storage, saved: () => JSON.parse(map.get(KEY) ?? '[]') as Session[] };
}

function stored(id: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    flowId: `${id}-flow`,
    ownerId: null,
    role: 'owner',
    personName: `Person ${id}`,
    dateOfPassing: 'May 1, 2026',
    senderName: 'Sam',
    obituaryUrl: '',
    createdAt: '2026-01-01T00:00:00.000Z',
    lastOpenedAt: '2026-01-01T00:00:00.000Z',
    drafts: {},
    serviceReady: false,
    recipientsNotified: {},
    momentCompletedAt: {},
    remindersScheduled: [],
    ...extra,
  };
}

function setup(list: unknown[] = [stored('s1'), stored('s2')]) {
  const m = mem(list);
  const hook = renderHook(() => useSessions(m.storage));
  const find = (id: string) => hook.result.current.sessions.find((s) => s.id === id) as Session;
  return { ...m, hook, find };
}

describe('useSessions checklist', () => {
  it('loads an old list with no checklist as all open', () => {
    const { find } = setup();
    expect(find('s1').checklist).toBeUndefined();
  });

  it('sets, changes and clears an item', () => {
    const { hook, find, saved } = setup();
    act(() => hook.result.current.setChecklistItem('s1', 'custody', 'done'));
    expect(find('s1').checklist).toEqual({ custody: 'done' });

    act(() => hook.result.current.setChecklistItem('s1', 'custody', 'not_applicable'));
    expect(find('s1').checklist).toEqual({ custody: 'not_applicable' });
    expect(saved()[0].checklist).toEqual({ custody: 'not_applicable' });

    act(() => hook.result.current.setChecklistItem('s1', 'custody', null));
    expect(find('s1').checklist).toEqual({});
    expect('custody' in (find('s1').checklist ?? {})).toBe(false);
  });

  it('keeps other items when one is set or cleared', () => {
    const { hook, find } = setup([stored('s1', { checklist: { custody: 'done', pronouncement: 'done' } })]);
    act(() => hook.result.current.setChecklistItem('s1', 'custody', null));
    expect(find('s1').checklist).toEqual({ pronouncement: 'done' });
  });

  it('leaves other sessions unchanged', () => {
    const { hook, find } = setup();
    const before = find('s2');
    act(() => hook.result.current.setChecklistItem('s1', 'custody', 'done'));
    expect(find('s2')).toBe(before);
  });

  it('does not change toFlowFacts output', () => {
    const { hook, find } = setup();
    const before = toFlowFacts(find('s1'));
    act(() => hook.result.current.setChecklistItem('s1', 'custody', 'done'));
    expect(toFlowFacts(find('s1'))).toEqual(before);
  });

  it('reloads saved ticks', () => {
    const { hook, storage } = setup();
    act(() => hook.result.current.setChecklistItem('s1', 'custody', 'done'));
    const again = renderHook(() => useSessions(storage));
    expect(again.result.current.sessions.find((s) => s.id === 's1')?.checklist).toEqual({ custody: 'done' });
  });
});
