import { act, renderHook } from '@testing-library/react';
import { toFlowFacts } from '@griever/shared';
import { freshDraft } from './useSendFlow.js';
import type { SendFlowStorage } from './useSendFlow.js';
import { getContactsRetentionExpiry, useSessions } from './useSessions.js';
import type { Session } from './useSessions.js';

const KEY = 'gg.sessions.v1';

function mem(initial?: unknown) {
  const map = new Map<string, string>();
  if (initial) {
    map.set(KEY, JSON.stringify(initial));
  }
  const storage: SendFlowStorage = {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  };
  return { storage, saved: () => JSON.parse(map.get(KEY) ?? '[]') as Session[] };
}

const OLD = {
  id: 's1',
  flowId: '11111111-1111-4111-8111-111111111111',
  ownerId: null,
  role: 'owner',
  personName: 'Margaret Hayes',
  dateOfPassing: 'May 1, 2026',
  senderName: 'Sam',
  obituaryUrl: '',
  serviceDate: 'May 29, 2026',
  createdAt: '2026-01-01T00:00:00.000Z',
  lastOpenedAt: '2026-01-01T00:00:00.000Z',
  drafts: {},
  serviceReady: false,
  recipientsNotified: {},
  momentCompletedAt: {},
  remindersScheduled: [],
};

function serviceDraft(fields: Record<string, string>) {
  return freshDraft({ templateCategory: 'service', step: 'template', fields });
}

function setup(stored: unknown[] = [OLD]) {
  const m = mem(stored);
  const hook = renderHook(() => useSessions(m.storage));
  return { ...m, hook, get: () => hook.result.current.sessions[0] };
}

describe('useSessions section fields', () => {
  it('loads an old stored list with values unchanged', () => {
    const { get } = setup();
    expect(get()).toMatchObject(OLD);
    expect(get().sectionStatus).toBeUndefined();
    expect(get().serviceTime).toBeUndefined();
  });

  it('saves event fields through updateSection("service") and sets in_progress', () => {
    const { hook, get } = setup();
    act(() => hook.result.current.updateSection('s1', 'service', { visitationDate: 'May 27, 2026', burialPlace: 'Oak Hill', burialPrivate: true }));
    expect(get()).toMatchObject({ visitationDate: 'May 27, 2026', burialPlace: 'Oak Hill', burialPrivate: true });
    expect(get().sectionStatus).toEqual({ service: 'in_progress' });
  });

  it('retention reads only serviceDate, never an event date', () => {
    const { hook, get } = setup();
    const before = getContactsRetentionExpiry([get()]);
    act(() =>
      hook.result.current.updateSection('s1', 'service', {
        visitationDate: 'Dec 1, 2030',
        burialDate: 'Dec 2, 2030',
        receptionDate: 'Dec 3, 2030',
      }),
    );
    expect(getContactsRetentionExpiry([get()])?.getTime()).toBe(before?.getTime());
    const none = setup([{ ...OLD, serviceDate: undefined, burialDate: 'Dec 2, 2030' }]);
    expect(getContactsRetentionExpiry([none.get()])).toBeNull();
  });

  it('updateSection sets in_progress only once and keeps ready', () => {
    const { hook, get } = setup();
    act(() => hook.result.current.updateSection('s1', 'obituary', { obituaryText: 'a' }));
    expect(get().sectionStatus?.obituary).toBe('in_progress');
    act(() => hook.result.current.setSectionStatus('s1', 'obituary', 'ready'));
    act(() => hook.result.current.updateSection('s1', 'obituary', { obituaryText: 'ab' }));
    expect(get().sectionStatus?.obituary).toBe('ready');
    expect(get().obituaryText).toBe('ab');
  });

  it('setSectionStatus sets and clears, and mirrors service to serviceReady', () => {
    const { hook, get } = setup();
    act(() => hook.result.current.setSectionStatus('s1', 'service', 'ready'));
    expect(get().sectionStatus?.service).toBe('ready');
    expect(get().serviceReady).toBe(true);
    act(() => hook.result.current.setSectionStatus('s1', 'service', 'in_progress'));
    expect(get().serviceReady).toBe(false);
    act(() => hook.result.current.setSectionStatus('s1', 'service', 'ready'));
    act(() => hook.result.current.setSectionStatus('s1', 'service', null));
    expect(get().sectionStatus && 'service' in get().sectionStatus!).toBe(false);
    expect(get().serviceReady).toBe(false);
  });

  it('setSectionStatus on another section leaves serviceReady alone', () => {
    const { hook, get } = setup([{ ...OLD, serviceReady: true }]);
    act(() => hook.result.current.setSectionStatus('s1', 'thanks', 'ready'));
    expect(get().serviceReady).toBe(true);
  });

  describe('one-time copy from the service draft', () => {
    const draft = serviceDraft({
      serviceTime: ' 2:00 pm ',
      serviceLocation: 'St. Mary',
      serviceNotes: 'Flowers welcome',
      serviceDate: 'June 1, 2026',
    });

    it('copies non-empty trimmed values into unset fields and marks in_progress', () => {
      const { get } = setup([{ ...OLD, drafts: { service: draft } }]);
      expect(get()).toMatchObject({ serviceTime: '2:00 pm', servicePlace: 'St. Mary', serviceNotes: 'Flowers welcome' });
      expect(get().sectionStatus).toEqual({ service: 'in_progress' });
    });

    it('does not copy serviceDate or change the draft', () => {
      const { get } = setup([{ ...OLD, drafts: { service: draft } }]);
      expect(get().serviceDate).toBe('May 29, 2026');
      expect(get().drafts.service).toEqual(draft);
    });

    it('never re-copies over a field cleared to an empty string', () => {
      const { get } = setup([{ ...OLD, serviceTime: '', drafts: { service: draft } }]);
      expect(get().serviceTime).toBe('');
      expect(get().servicePlace).toBe('St. Mary');
    });

    it('does not overwrite a set value, and does not mark anything when nothing is copied', () => {
      const { get } = setup([
        { ...OLD, serviceTime: '9', servicePlace: 'x', serviceNotes: 'y', drafts: { service: draft } },
      ]);
      expect(get()).toMatchObject({ serviceTime: '9', servicePlace: 'x', serviceNotes: 'y' });
      expect(get().sectionStatus).toBeUndefined();
    });

    it('ignores blank draft values', () => {
      const { get } = setup([{ ...OLD, drafts: { service: serviceDraft({ serviceTime: '   ' }) } }]);
      expect(get().serviceTime).toBeUndefined();
      expect(get().sectionStatus).toBeUndefined();
    });

    it('is saved, so the copy is stable on the next load', () => {
      const { saved } = setup([{ ...OLD, drafts: { service: draft } }]);
      expect(saved()[0]).toMatchObject({ serviceTime: '2:00 pm', sectionStatus: { service: 'in_progress' } });
    });
  });

  describe('corrupt stored sectionStatus', () => {
    it('drops values that are not in_progress or ready', () => {
      const { get } = setup([
        { ...OLD, sectionStatus: { person: 'ready', service: 'done', obituary: 5, thanks: null, announcement: 'in_progress' } },
      ]);
      expect(get().sectionStatus).toEqual({ person: 'ready', announcement: 'in_progress' });
    });

    it.each(['ready', 7, ['ready']])('drops a non-object sectionStatus %j', (bad) => {
      const { get } = setup([{ ...OLD, sectionStatus: bad }]);
      expect(get().sectionStatus).toBeUndefined();
    });
  });

  it('toFlowFacts output is unchanged by the new fields', () => {
    const plain = setup();
    const before = toFlowFacts(plain.get());
    act(() => {
      plain.hook.result.current.updateSection('s1', 'service', { serviceTime: '2', burialDate: 'x', serviceMessage: 'm' });
      plain.hook.result.current.setSectionStatus('s1', 'service', 'ready');
    });
    expect(toFlowFacts(plain.get())).toEqual({ ...before, serviceReady: true });
    expect(Object.keys(toFlowFacts(plain.get())).sort()).toEqual(Object.keys(before).sort());
  });
});
