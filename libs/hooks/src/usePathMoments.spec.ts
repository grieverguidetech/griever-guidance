import { computeMoments } from './usePathMoments';
import type { Session } from './useSessions';

function session(over: Partial<Session> = {}): Session {
  return {
    id: 'a',
    flowId: 'f',
    personName: 'Anna',
    obituaryUrl: '',
    drafts: {},
    recipientsNotified: {},
    momentCompletedAt: {},
    remindersScheduled: [],
    ...over,
  } as unknown as Session;
}

const obituary = (s: Session) => computeMoments(s).find((m) => m.key === 'obituary');

describe('computeMoments: the obituary', () => {
  it('is done when emailed, with no link and no one texted', () => {
    const emailed = session({ obituaryEmailedAt: '2026-10-11T10:00:00.000Z' });
    expect(obituary(emailed)?.status).toBe('done');
  });

  it('is still done when texted with a link', () => {
    const texted = session({ recipientsNotified: { obituary: ['c1'] }, obituaryUrl: 'https://x.test/o' });
    expect(obituary(texted)?.status).toBe('done');
  });

  it('is not done with only text written, or texted without a link', () => {
    expect(obituary(session({ obituaryText: 'Anna loved the garden.' }))?.status).not.toBe('done');
    expect(obituary(session({ recipientsNotified: { obituary: ['c1'] } }))?.status).not.toBe('done');
  });

  it('is not done when texted without a link, even though a text send writes momentCompletedAt.obituary', () => {
    const texted = session({ recipientsNotified: { obituary: ['c1'] }, momentCompletedAt: { obituary: '2026-10-11T10:00:00.000Z' } });
    expect(obituary(texted)?.status).not.toBe('done');
  });

  it('leaves the other moments unchanged, and a session saved without the marker as before', () => {
    const emailed = computeMoments(session({ obituaryEmailedAt: '2026-10-11T10:00:00.000Z' }));
    expect(emailed.map((m) => m.status)).toEqual(['next', 'later', 'done', 'later']);
    const legacy = session({ momentCompletedAt: undefined, recipientsNotified: { announcement: ['c1'] } });
    expect(computeMoments(legacy).map((m) => m.status)).toEqual(['done', 'next', 'later', 'later']);
  });
});
