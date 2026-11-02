import { firstMissingField, sendCardStatus } from './sendCardStatus';
import type { Session } from './useSessions';

function session(over: Partial<Session> = {}): Session {
  return {
    id: 'a',
    flowId: 'f',
    ownerId: null,
    role: 'owner',
    personName: 'Anna',
    dateOfPassing: '',
    senderName: '',
    obituaryUrl: '',
    drafts: {},
    serviceReady: false,
    recipientsNotified: {},
    momentCompletedAt: {},
    remindersScheduled: [],
    ...over,
  } as unknown as Session;
}

describe('sendCardStatus', () => {
  it('announce is ready with no details, and sent once people were messaged', () => {
    expect(sendCardStatus(session(), 'announce')).toBe('ready');
    expect(sendCardStatus(session({ recipientsNotified: { announcement: ['c1', 'c2'] } }), 'announce')).toEqual({ sent: 2 });
  });

  it('service needs a detail with no date, and with only a date', () => {
    expect(sendCardStatus(session(), 'service')).toBe('needsDetail');
    expect(sendCardStatus(session({ serviceDate: 'June 14, 2026' }), 'service')).toBe('needsDetail');
  });

  it('service is ready when the web plan has date, time and place', () => {
    const planned = session({ serviceDate: 'June 14, 2026', serviceTime: '2:00 PM', servicePlace: 'St Mary' });
    expect(sendCardStatus(planned, 'service')).toBe('ready');
  });

  it('service needs a detail with date and place but no time', () => {
    expect(sendCardStatus(session({ serviceDate: 'June 14, 2026', servicePlace: 'St Mary' }), 'service')).toBe('needsDetail');
  });

  it('service is sent when people were messaged, even with no date', () => {
    expect(sendCardStatus(session({ recipientsNotified: { service: ['c1'] } }), 'service')).toEqual({ sent: 1 });
  });

  it('obituary needs a detail without a link, and is ready with one', () => {
    expect(sendCardStatus(session(), 'obituary')).toBe('needsDetail');
    expect(sendCardStatus(session({ obituaryUrl: 'https://example.com/o' }), 'obituary')).toBe('ready');
  });

  it('obituary with written text and no link is waiting for the link, not needing a detail', () => {
    expect(sendCardStatus(session({ obituaryText: 'Anna loved the garden.' }), 'obituary')).toBe('waitingForLink');
    expect(sendCardStatus(session({ obituaryText: '   ' }), 'obituary')).toBe('needsDetail');
    expect(sendCardStatus(session({ obituaryText: 'Text', obituaryUrl: 'https://example.com/o' }), 'obituary')).toBe('ready');
    expect(sendCardStatus(session({ obituaryText: 'Text', recipientsNotified: { obituary: ['c1'] } }), 'obituary')).toBe('waitingForLink');
  });

  it('obituary is not sent without a link, even if people were messaged', () => {
    expect(sendCardStatus(session({ recipientsNotified: { obituary: ['c1'] } }), 'obituary')).toBe('needsDetail');
    const withLink = session({ recipientsNotified: { obituary: ['c1', 'c2', 'c3'] }, obituaryUrl: 'https://example.com/o' });
    expect(sendCardStatus(withLink, 'obituary')).toEqual({ sent: 3 });
  });

  it('thanks needs the sender name, then is ready', () => {
    expect(sendCardStatus(session(), 'thanks')).toBe('needsDetail');
    expect(sendCardStatus(session({ senderName: 'The Hayes family' }), 'thanks')).toBe('ready');
  });

  it('a blank person name still counts as missing', () => {
    expect(sendCardStatus(session({ personName: ' ', senderName: 'Me' }), 'thanks')).toBe('needsDetail');
  });
});

describe('firstMissingField', () => {
  const planned = { serviceDate: 'June 14, 2026', serviceTime: '2:00 PM', servicePlace: 'St Mary' };

  it('names each required service field in turn as the earlier ones are filled', () => {
    expect(firstMissingField(session(), 'service')?.key).toBe('serviceDate');
    expect(firstMissingField(session({ serviceDate: planned.serviceDate }), 'service')?.key).toBe('serviceTime');
    expect(firstMissingField(session({ serviceDate: planned.serviceDate, serviceTime: planned.serviceTime }), 'service')?.key).toBe('serviceLocation');
    expect(firstMissingField(session(planned), 'service')).toBeNull();
  });

  it('names the sender for the thank-yous and the link for the obituary', () => {
    expect(firstMissingField(session(), 'thanks')?.key).toBe('senderName');
    expect(firstMissingField(session({ senderName: 'Sam' }), 'thanks')).toBeNull();
    expect(firstMissingField(session(), 'obituary')?.key).toBe('obituaryUrl');
    expect(firstMissingField(session({ obituaryUrl: 'https://example.com/anna' }), 'obituary')).toBeNull();
  });

  it('never has a missing field for the announcement', () => {
    expect(firstMissingField(session(), 'announce')).toBeNull();
  });

  it('agrees with sendCardStatus for every moment, empty and filled', () => {
    const sessions = [session(), session(planned), session({ senderName: 'Sam', obituaryUrl: 'https://example.com/anna' })];
    for (const s of sessions) {
      for (const key of ['announce', 'service', 'obituary', 'thanks'] as const) {
        const status = sendCardStatus(s, key);
        const missing = firstMissingField(s, key) !== null;
        if (typeof status === 'string') {
          expect(missing).toBe(status === 'needsDetail' || status === 'waitingForLink');
        }
      }
    }
  });
});
