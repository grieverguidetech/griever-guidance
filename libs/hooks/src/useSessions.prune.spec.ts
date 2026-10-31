import { act, renderHook } from '@testing-library/react';
import type { SendFlowStorage } from './useSendFlow.js';
import { useSessions } from './useSessions.js';

const KEY = 'gg.sessions.v1';

function blank(id: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    flowId: `11111111-1111-4111-8111-1111111111${id.padStart(2, '0')}`,
    ownerId: null,
    role: 'owner',
    personName: '',
    dateOfPassing: '',
    senderName: '',
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

function run(stored: unknown[]) {
  const map = new Map<string, string>([[KEY, JSON.stringify(stored)]]);
  const storage: SendFlowStorage = {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  };
  const hook = renderHook(() => useSessions(storage));
  act(() => hook.result.current.pruneEmpty());
  return hook.result.current.sessions.map((s) => s.id);
}

describe('pruneEmpty', () => {
  it('drops a person with no name, drafts or section data', () => {
    expect(run([blank('1')])).toEqual([]);
  });

  it('keeps a person with a name', () => {
    expect(run([blank('1', { personName: 'Margaret' })])).toEqual(['1']);
  });

  it('keeps an unnamed person who has any section status', () => {
    expect(run([blank('1', { sectionStatus: { service: 'in_progress' } })])).toEqual(['1']);
  });

  it.each([
    ['serviceDate', 'May 29'],
    ['servicePlace', 'Oak Hill'],
    ['visitationDate', 'May 27'],
    ['birthDate', '1950-01-01'],
    ['burialPrivate', true],
    ['dateOfPassing', 'May 1'],
  ])('keeps an unnamed person who has %s', (key, value) => {
    expect(run([blank('1', { [key]: value })])).toEqual(['1']);
  });

  it('keeps an unnamed person who has a checklist tick', () => {
    expect(run([blank('1', { checklist: { 'headstone': 'done' } })])).toEqual(['1']);
  });

  it('treats blank-only text as empty', () => {
    expect(run([blank('1', { servicePlace: '   ' })])).toEqual([]);
  });
});
