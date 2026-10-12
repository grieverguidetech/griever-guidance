import { renderHook, act } from '@testing-library/react';
import { freshDraft } from './useSendFlow.js';
import type { SendFlowStorage } from './useSendFlow.js';
import type { Session } from './useSessions.js';
import { CONTACT_RETENTION_DAYS, getContactsRetentionExpiry, stripSentWording, useSessions } from './useSessions.js';

function session(serviceDate?: string): Session {
  return {
    id: 's1',
    createdAt: '2026-01-01T00:00:00.000Z',
    lastOpenedAt: '2026-01-01T00:00:00.000Z',
    personName: 'Margaret Hayes',
    serviceDate,
    draft: null,
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

  it('strips an old sent draft when sessions load, and leaves in-progress ones alone', () => {
    const old = (id: string, step: 'sent' | 'review') => ({
      ...session(),
      id,
      draft: freshDraft({ step, templateCategory: 'announcement', selectedContactIds: ['c1'], ...wording }),
    });
    const storage = memoryStorage([old('done', 'sent'), old('busy', 'review')]);
    const { result } = renderHook(() => useSessions(storage));
    const byId = Object.fromEntries(result.current.sessions.map((s) => [s.id, s]));
    expect(byId['done'].draft).toEqual(
      freshDraft({ step: 'sent', templateCategory: 'announcement', selectedContactIds: ['c1'] }),
    );
    expect(byId['busy'].draft?.messageOverride).toBe('My own private words.');
    const saved = JSON.parse(storage.dump()) as Session[];
    expect(saved.find((x) => x.id === 'done')?.draft?.messageOverride).toBeNull();
    expect(saved.find((x) => x.id === 'done')?.draft?.fields).toEqual({});
  });
});
