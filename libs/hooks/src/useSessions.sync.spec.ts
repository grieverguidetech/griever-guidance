import { act, renderHook } from '@testing-library/react';
import type { FlowDetails, FlowFacts, FlowRecord } from '@griever/shared';
import type { Session } from './useSessions.js';
import { useSessions } from './useSessions.js';

const A = '11111111-1111-4111-8111-111111111111';
const ME = '22222222-2222-4222-8222-222222222222';
const OTHER = '33333333-3333-4333-8333-333333333333';

const facts = (over: Partial<FlowFacts> = {}): FlowFacts => ({
  personName: 'Joan',
  dateOfPassing: null,
  serviceDate: null,
  obituaryUrl: null,
  obituaryPublisher: null,
  serviceReady: false,
  ...over,
});

const record = (
  over: { facts?: Partial<FlowFacts>; details?: Partial<FlowDetails>; ownerId?: string } = {},
): FlowRecord => {
  const ownerId = over.ownerId ?? ME;
  return {
    id: A,
    ownerId,
    role: ownerId === ME ? 'owner' : 'member',
    facts: facts(over.facts),
    ...(over.details ? { details: over.details as FlowDetails } : {}),
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

  describe('serviceStatus and serviceReady stay coupled', () => {
    it('a remote ready status sets the flag', () => {
      const [s] = apply([local()], [record({ details: { serviceStatus: 'ready' } })]);
      expect(s.sectionStatus?.service).toBe('ready');
      expect(s.serviceReady).toBe(true);
    });

    it('a remote in_progress status clears the flag', () => {
      const [s] = apply(
        [local({ serviceReady: true, sectionStatus: { service: 'ready' } })],
        [record({ facts: { serviceReady: true }, details: { serviceStatus: 'in_progress' } })],
      );
      expect(s.sectionStatus?.service).toBe('in_progress');
      expect(s.serviceReady).toBe(false);
    });

    it('a remote flag alone (older device) sets the status to ready', () => {
      const [s] = apply([local()], [record({ facts: { serviceReady: true } })]);
      expect(s.serviceReady).toBe(true);
      expect(s.sectionStatus?.service).toBe('ready');
    });

    it('a remote flag turned off clears a ready status, but keeps in_progress', () => {
      const [cleared] = apply(
        [local({ serviceReady: true, sectionStatus: { service: 'ready' } })],
        [record({ facts: { serviceReady: false } })],
      );
      expect(cleared.sectionStatus?.service).toBeUndefined();
      const [kept] = apply(
        [local({ serviceReady: true, sectionStatus: { service: 'in_progress' } })],
        [record({ facts: { serviceReady: false } })],
      );
      expect(kept.sectionStatus?.service).toBe('in_progress');
    });

    it('a pending edit to either one keeps both local', () => {
      const [s] = apply(
        [local({ serviceReady: true, sectionStatus: { service: 'ready' } })],
        [record({ facts: { serviceReady: false }, details: { serviceStatus: 'in_progress' } })],
        { [A]: ['serviceStatus'] },
      );
      expect(s.serviceReady).toBe(true);
      expect(s.sectionStatus?.service).toBe('ready');
    });

    it('a new session from a record with only the flag shows the service as ready', () => {
      const [s] = apply([], [record({ facts: { serviceReady: true } })]);
      expect(s.sectionStatus?.service).toBe('ready');
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
