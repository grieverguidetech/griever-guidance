import { act, renderHook } from '@testing-library/react';
import { toFlowDetails } from '@griever/shared';
import type { FlowDetails, FlowFacts, FlowRecord } from '@griever/shared';
import type { Session } from './useSessions.js';
import { useSessions } from './useSessions.js';

const A = '11111111-1111-4111-8111-111111111111';
const ME = 'user_me';
const OTHER = 'user_other';

const facts = (over: Partial<FlowFacts> = {}): FlowFacts => ({
  personName: 'Joan',
  dateOfPassing: null,
  serviceDate: null,
  obituaryUrl: null,
  obituaryPublisher: null,
  serviceReady: false,
  ...over,
});

const emptyDetails = (): FlowDetails => toFlowDetails({});

const record = (
  over: { facts?: Partial<FlowFacts>; details?: Partial<FlowDetails>; ownerId?: string } = {},
): FlowRecord => {
  const ownerId = over.ownerId ?? ME;
  return {
    id: A,
    ownerId,
    role: ownerId === ME ? 'owner' : 'member',
    facts: facts(over.facts),
    ...(over.details ? { details: over.details } : {}),
    updatedAt: '2026-10-01T00:00:00.000Z',
    updatedBy: null,
  };
};

const mem = (sessions: Partial<Session>[] = []) => {
  const data = new Map<string, string>();
  if (sessions.length > 0) {
    data.set('gg.sessions.v1', JSON.stringify(sessions));
  }
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  };
};

const local = (over: Partial<Session> = {}): Partial<Session> => ({
  id: 'local-1',
  flowId: A,
  ownerId: ME,
  role: 'owner',
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

function apply(
  sessions: Partial<Session>[],
  records: FlowRecord[],
  pending: Record<string, string[]> = {},
) {
  const view = renderHook(() => useSessions(mem(sessions)));
  act(() =>
    view.result.current.applyRemoteFlows({ flows: records }, ME, pending as never),
  );
  return view.result.current.sessions;
}

describe('applyRemoteFlows with details (DS-7)', () => {
  it('adds a record the account owns as an owner session, with its details', () => {
    const [s] = apply([], [
      record({
        details: { servicePlace: 'St. Mark', serviceMessage: 'Join us.', burialPrivate: true, personStatus: 'ready' },
      }),
    ]);
    expect(s).toMatchObject({
      role: 'owner',
      ownerId: ME,
      servicePlace: 'St. Mark',
      serviceMessage: 'Join us.',
      burialPrivate: true,
      sectionStatus: { person: 'ready' },
    });
  });

  it('adds a record someone else owns as a member session', () => {
    const [s] = apply([], [record({ ownerId: OTHER })]);
    expect(s).toMatchObject({ role: 'member', ownerId: OTHER });
  });

  it('arrives with a null message as undefined and a null text as an empty string', () => {
    const [s] = apply([], [record({ details: { serviceMessage: null, servicePlace: null } })]);
    expect(s.serviceMessage).toBeUndefined();
    expect(s.servicePlace).toBe('');
  });

  it('writes remote details into an existing session', () => {
    const [s] = apply([local()], [record({ details: { serviceTime: '10am', obituaryCity: 'Austin' } })]);
    expect(s).toMatchObject({ serviceTime: '10am', obituaryCity: 'Austin' });
  });

  it('never overwrites a pending detail key, but takes the others', () => {
    const [s] = apply(
      [local({ serviceMessage: 'My words' })],
      [record({ details: { serviceMessage: 'Server words', serviceTime: '10am' } })],
      { [A]: ['serviceMessage'] },
    );
    expect(s.serviceMessage).toBe('My words');
    expect(s.serviceTime).toBe('10am');
  });

  it('a reset message from the server clears the local one (null becomes undefined)', () => {
    const [s] = apply([local({ serviceMessage: 'Old words' })], [record({ details: { serviceMessage: null } })]);
    expect(s.serviceMessage).toBeUndefined();
    expect('serviceMessage' in s).toBe(true);
  });

  it('an empty-string message stays an empty string', () => {
    const [s] = apply([local({ serviceMessage: 'Old words' })], [record({ details: { serviceMessage: '' } })]);
    expect(s.serviceMessage).toBe('');
  });

  it('writes only the changed keys: text being typed is not rewritten', () => {
    const [s] = apply(
      [local({ serviceNotes: 'Bring chairs  ' })],
      [record({ details: { serviceNotes: 'Bring chairs', servicePlace: 'St. Mark' } })],
    );
    expect(s.serviceNotes).toBe('Bring chairs  ');
    expect(s.servicePlace).toBe('St. Mark');
  });

  it('a record without details leaves the local details alone', () => {
    const [s] = apply([local({ serviceNotes: 'Keep', sectionStatus: { person: 'ready' } })], [record()]);
    expect(s).toMatchObject({ serviceNotes: 'Keep', sectionStatus: { person: 'ready' } });
  });

  it('a partial remote status does not wipe the other statuses', () => {
    const [s] = apply(
      [local({ sectionStatus: { person: 'ready', announcement: 'in_progress' } })],
      [record({ details: { obituaryStatus: 'in_progress' } })],
    );
    expect(s.sectionStatus).toEqual({ person: 'ready', announcement: 'in_progress', obituary: 'in_progress' });
  });

  it('a remote null status removes just that section', () => {
    const [s] = apply(
      [local({ sectionStatus: { person: 'ready', announcement: 'in_progress' } })],
      [record({ details: { announcementStatus: null } })],
    );
    expect(s.sectionStatus).toEqual({ person: 'ready' });
  });

  describe('serviceStatus and serviceReady sync as stored', () => {
    const full = (over: Partial<FlowDetails> = {}): Partial<FlowDetails> => ({ ...emptyDetails(), ...over });

    it('a remote status alone does not touch the flag', () => {
      const [s] = apply([local()], [record({ details: { serviceStatus: 'ready' } })]);
      expect(s.sectionStatus?.service).toBe('ready');
      expect(s.serviceReady).toBe(false);
    });

    it('a remote flag alone does not touch the status', () => {
      const [s] = apply([local()], [record({ facts: { serviceReady: true } })]);
      expect(s.serviceReady).toBe(true);
      expect(s.sectionStatus?.service).toBeUndefined();
    });

    for (const [label, status] of [['null', null], ['in_progress', 'in_progress']] as const) {
      it(`flag true with status ${label}: add and merge paths agree`, () => {
        const rec = record({ facts: { serviceReady: true }, details: full({ serviceStatus: status }) });
        const [added] = apply([], [rec]);
        const [merged] = apply([local()], [rec]);
        for (const s of [added, merged]) {
          expect(s.serviceReady).toBe(true);
          expect(s.sectionStatus?.service).toBe(status ?? undefined);
        }
      });
    }

    it('flag false with status ready: add and merge paths agree', () => {
      const rec = record({ details: full({ serviceStatus: 'ready' }) });
      const [added] = apply([], [rec]);
      const [merged] = apply([local()], [rec]);
      for (const s of [added, merged]) {
        expect(s.serviceReady).toBe(false);
        expect(s.sectionStatus?.service).toBe('ready');
      }
    });

    it('a remote flag turned off keeps the local status', () => {
      const [s] = apply(
        [local({ serviceReady: true, sectionStatus: { service: 'in_progress' } })],
        [record({ facts: { serviceReady: false } })],
      );
      expect(s.serviceReady).toBe(false);
      expect(s.sectionStatus?.service).toBe('in_progress');
    });

    it('a pending edit to either one keeps both local', () => {
      for (const key of ['serviceStatus', 'serviceReady']) {
        const [s] = apply(
          [local({ serviceReady: true, sectionStatus: { service: 'ready' } })],
          [record({ facts: { serviceReady: false }, details: full({ serviceStatus: 'in_progress' }) })],
          { [A]: [key] },
        );
        expect(s.serviceReady).toBe(true);
        expect(s.sectionStatus?.service).toBe('ready');
      }
    });
  });

  it('claims a session with no owner when the record is the account\'s own', () => {
    const [s] = apply([local({ ownerId: null })], [record()]);
    expect(s).toMatchObject({ ownerId: ME, role: 'owner' });
  });

  it('does not take a session with no owner for another account\'s record', () => {
    const [s] = apply([local({ ownerId: null })], [record({ ownerId: OTHER, details: { serviceTime: '10am' } })]);
    expect(s).toMatchObject({ ownerId: null, role: 'owner', serviceTime: '10am' });
  });

  it('never touches drafts, wording, recipients or sender name', () => {
    const [s] = apply(
      [local({ senderName: 'Anna', recipientsNotified: { announcement: ['c1'] } })],
      [record({ details: { announcementMessage: 'Words' } })],
    );
    expect(s.senderName).toBe('Anna');
    expect(s.recipientsNotified).toEqual({ announcement: ['c1'] });
    expect(s.drafts).toEqual({});
  });
});
