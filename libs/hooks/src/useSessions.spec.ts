import { renderHook, act } from '@testing-library/react';
import { freshDraft } from './useSendFlow.js';
import type { SendFlowStorage } from './useSendFlow.js';
import type { Session } from './useSessions.js';
import {
  CONTACT_RETENTION_DAYS,
  getContactsRetentionExpiry,
  latestInProgressDraft,
  stripSentWording,
  useSessions,
} from './useSessions.js';

function session(serviceDate?: string): Session {
  return {
    id: 's1',
    createdAt: '2026-01-01T00:00:00.000Z',
    lastOpenedAt: '2026-01-01T00:00:00.000Z',
    personName: 'Margaret Hayes',
    serviceDate,
    drafts: {},
    reminders: [],
  } as unknown as Session;
}

describe('getContactsRetentionExpiry', () => {
  it('keeps contacts indefinitely when there is no service date', () => {
    expect(getContactsRetentionExpiry([])).toBeNull();
    expect(getContactsRetentionExpiry([session(undefined), session('')])).toBeNull();
  });

  // #79: these parse to 2001/2002/0202 with new Date(), which used to expire
  // (and so delete) every saved contact while a date was still being typed.
  it.each(['6', '6/12', 'May 2', 'May 29, 2', 'May 29, 202', '5/29/2', '2026-0'])(
    'never sets an expiry from the partial service date %j',
    (partial) => {
      expect(getContactsRetentionExpiry([session(partial)])).toBeNull();
    },
  );

  it('sets an expiry 30 days after a complete past service date', () => {
    const expiry = getContactsRetentionExpiry([session('May 29, 2026')]);
    expect(expiry).not.toBeNull();
    expect(expiry?.getTime()).toBe(new Date(2026, 4, 29 + CONTACT_RETENTION_DAYS).getTime());
  });

  it('ignores a partial date next to a complete one', () => {
    const expiry = getContactsRetentionExpiry([session('May 2'), session('2026-06-10')]);
    expect(expiry?.getTime()).toBe(new Date(2026, 5, 10 + CONTACT_RETENTION_DAYS).getTime());
  });
});

describe('message wording after a send (C2, #82)', () => {
  const wording = {
    fields: { note: 'She was peaceful at the end.' },
    messageOverride: 'My own private words.',
    place: { formattedAddress: '1 Church Lane' } as never,
  };

  function memoryStorage(initial?: unknown): SendFlowStorage & { dump: () => string } {
    const map = new Map<string, string>();
    if (initial) map.set('gg.sessions.v1', JSON.stringify(initial));
    return {
      getItem: (k) => map.get(k) ?? null,
      setItem: (k, v) => void map.set(k, v),
      removeItem: (k) => void map.delete(k),
      dump: () => map.get('gg.sessions.v1') ?? '',
    };
  }

  it('strips the wording from a sent draft but keeps the moment and who was messaged', () => {
    const sent = freshDraft({ step: 'sent', templateCategory: 'announcement', selectedContactIds: ['c1'], ...wording });
    expect(stripSentWording(sent)).toEqual(
      freshDraft({ step: 'sent', templateCategory: 'announcement', selectedContactIds: ['c1'] }),
    );
  });

  it('does not touch a draft that is still in progress', () => {
    for (const step of ['details', 'contacts', 'review', 'sending'] as const) {
      const draft = freshDraft({ step, templateCategory: 'announcement', selectedContactIds: ['c1'], ...wording });
      expect(stripSentWording(draft)).toBe(draft);
    }
  });

  it('strips on updateDraft, so the saved JSON has no wording', () => {
    const storage = memoryStorage();
    const { result } = renderHook(() => useSessions(storage));
    let id = '';
    act(() => {
      id = result.current.createSession({ personName: 'Margaret Hayes' }).id;
    });
    act(() => {
      result.current.updateDraft(id, freshDraft({ step: 'review', templateCategory: 'announcement', ...wording }));
    });
    expect(storage.dump()).toContain('peaceful');
    act(() => {
      result.current.updateDraft(id, freshDraft({ step: 'sent', templateCategory: 'announcement', ...wording }));
    });
    expect(storage.dump()).not.toContain('peaceful');
    expect(storage.dump()).not.toContain('private words');
    expect(storage.dump()).not.toContain('Church Lane');
  });

  it('keeps a sent draft free of wording per moment, next to another moment still in progress', () => {
    const storage = memoryStorage();
    const { result } = renderHook(() => useSessions(storage));
    let id = '';
    act(() => {
      id = result.current.createSession({ personName: 'Margaret Hayes' }).id;
    });
    act(() => {
      result.current.updateDraft(id, freshDraft({ step: 'details', templateCategory: 'service', ...wording }));
      result.current.updateDraft(id, freshDraft({ step: 'sent', templateCategory: 'announcement', ...wording }));
    });
    const [saved] = result.current.sessions;
    expect(saved.drafts.announcement?.fields).toEqual({});
    expect(saved.drafts.announcement?.messageOverride).toBeNull();
    expect(saved.drafts.service?.messageOverride).toBe('My own private words.');
  });

  it('strips an old sent draft when sessions load, and leaves in-progress ones alone', () => {
    const old = (id: string, step: 'sent' | 'review') => ({
      ...session(),
      id,
      draft: freshDraft({ step, templateCategory: 'announcement', selectedContactIds: ['c1'], ...wording }),
    });
    const storage = memoryStorage([old('done', 'sent'), old('busy', 'review')]);
    const { result } = renderHook(() => useSessions(storage));
    const byId = Object.fromEntries(result.current.sessions.map((s) => [s.id, s]));
    expect(byId['done'].drafts.announcement).toEqual(
      freshDraft({ step: 'sent', templateCategory: 'announcement', selectedContactIds: ['c1'] }),
    );
    expect(byId['busy'].drafts.announcement?.messageOverride).toBe('My own private words.');
    const saved = JSON.parse(storage.dump()) as Session[];
    expect(saved.find((x) => x.id === 'done')?.drafts.announcement?.messageOverride).toBeNull();
    expect(saved.find((x) => x.id === 'done')?.drafts.announcement?.fields).toEqual({});
  });
});


describe('one draft per moment (#83)', () => {
  const memory = (initial?: unknown): SendFlowStorage & { dump: () => Session[] } => {
    const map = new Map<string, string>();
    if (initial) map.set('gg.sessions.v1', JSON.stringify(initial));
    return {
      getItem: (k) => map.get(k) ?? null,
      setItem: (k, v) => void map.set(k, v),
      removeItem: (k) => void map.delete(k),
      dump: () => JSON.parse(map.get('gg.sessions.v1') ?? '[]') as Session[],
    };
  };

  function start() {
    const storage = memory();
    const hook = renderHook(() => useSessions(storage));
    let id = '';
    act(() => {
      id = hook.result.current.createSession({ personName: 'Margaret Hayes' }).id;
    });
    return { ...hook, id, storage };
  }

  it('writes a draft under its own moment and leaves the others alone', () => {
    const { result, id } = start();
    const announcement = freshDraft({ templateCategory: 'announcement', step: 'announce', fields: { personalNote: 'Kind and gentle' } });
    act(() => result.current.updateDraft(id, announcement));
    act(() => result.current.updateDraft(id, freshDraft({ templateCategory: 'service', step: 'details' })));
    const [saved] = result.current.sessions;
    expect(saved.drafts.announcement).toEqual(announcement);
    expect(saved.drafts.service?.step).toBe('details');
  });

  it('clearDraft removes only that moment, and leaves the others, who was notified and the person', () => {
    const { result, id, storage } = start();
    const announcement = freshDraft({ templateCategory: 'announcement', step: 'announce', fields: { personalNote: 'Kind' } });
    act(() => result.current.updateDraft(id, announcement));
    act(() => result.current.updateDraft(id, freshDraft({ templateCategory: 'service', step: 'details', fields: { serviceLocation: 'St Mary' } })));
    act(() => result.current.recordMomentComplete(id, 'service', ['c-1']));
    act(() => result.current.clearDraft(id, 'service'));
    const [saved] = storage.dump();
    expect(Object.keys(saved.drafts)).toEqual(['announcement']);
    expect(saved.drafts.announcement).toEqual(announcement);
    expect(Object.keys(saved.draftsUpdatedAt ?? {})).toEqual(['announcement']);
    expect(saved.recipientsNotified.service).toEqual(['c-1']);
    expect(saved.personName).toBe('Margaret Hayes');
  });

  it('does not keep a draft with no moment chosen yet', () => {
    const { result, id } = start();
    act(() => result.current.updateDraft(id, freshDraft({})));
    expect(result.current.sessions[0].drafts).toEqual({});
  });

  it('reopens the draft that changed most recently, and never a sent one', () => {
    const { result, id } = start();
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-10-11T10:00:00Z'));
      act(() => result.current.updateDraft(id, freshDraft({ templateCategory: 'announcement', step: 'review' })));
      vi.setSystemTime(new Date('2026-10-11T11:00:00Z'));
      act(() => result.current.updateDraft(id, freshDraft({ templateCategory: 'service', step: 'details' })));
      expect(latestInProgressDraft(result.current.sessions[0])?.templateCategory).toBe('service');
      vi.setSystemTime(new Date('2026-10-11T12:00:00Z'));
      act(() => result.current.updateDraft(id, freshDraft({ templateCategory: 'announcement', step: 'sent' })));
      expect(latestInProgressDraft(result.current.sessions[0])?.templateCategory).toBe('service');
    } finally {
      vi.useRealTimers();
    }
  });

  describe('migrating the old single draft', () => {
    const old = (draft: unknown) => ({ ...session(), id: 'old', lastOpenedAt: '2026-10-01T00:00:00.000Z', drafts: undefined, draft });

    it('moves it into drafts under its moment, and drops the old slot', () => {
      const draft = freshDraft({ templateCategory: 'announcement', step: 'announce', fields: { personalNote: 'Kind' } });
      const storage = memory([old(draft)]);
      const { result } = renderHook(() => useSessions(storage));
      expect(result.current.sessions[0].drafts).toEqual({ announcement: draft });
      expect(latestInProgressDraft(result.current.sessions[0])).toEqual(draft);
      expect(storage.dump()[0]).not.toHaveProperty('draft');
    });

    it('is idempotent: loading what a load saved gives the same sessions', () => {
      const draft = freshDraft({ templateCategory: 'announcement', step: 'announce', fields: { personalNote: 'Kind' } });
      const first = memory([old(draft)]);
      const one = renderHook(() => useSessions(first)).result.current.sessions;
      const second = memory(first.dump());
      const two = renderHook(() => useSessions(second)).result.current.sessions;
      expect(two).toEqual(one);
      expect(two[0].drafts).toEqual(one[0].drafts);
      expect(two[0].draftsUpdatedAt).toEqual(one[0].draftsUpdatedAt);
    });

    it('drops an empty draft with no moment, and a null draft', () => {
      for (const draft of [freshDraft({}), null]) {
        const { result } = renderHook(() => useSessions(memory([old(draft)])));
        expect(result.current.sessions[0].drafts).toEqual({});
      }
    });

    it('strips the wording from an old sent draft (C2)', () => {
      const sent = freshDraft({ templateCategory: 'service', step: 'sent', fields: { note: 'private' }, messageOverride: 'private' });
      const storage = memory([old(sent)]);
      renderHook(() => useSessions(storage));
      expect(storage.dump()[0].drafts.service?.fields).toEqual({});
      expect(JSON.stringify(storage.dump())).not.toContain('private');
    });
  });
});
