import { describe, expect, it } from '@jest/globals';
import { sendCardStatus } from '@griever/hooks';
import type { Session } from '@griever/hooks';
import type { MomentKey } from '@griever/shared';
import { fieldPhrase, firstMissingField } from './firstMissingField';

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

describe('firstMissingField', () => {
  it('names the first required service field that is empty, from the template', () => {
    const field = firstMissingField(session(), 'service');
    expect(field?.required).toBe(true);
    expect(field?.label).toBeTruthy();
  });

  it('moves to the next field once the first is filled', () => {
    const first = firstMissingField(session(), 'service');
    const next = firstMissingField(session({ serviceDate: 'June 14, 2026' }), 'service');
    expect(next?.key).not.toBe(first?.key);
  });

  it('is null when the service is fully planned', () => {
    expect(firstMissingField(session({ serviceDate: 'June 14, 2026', serviceTime: '2:00 PM', servicePlace: 'St Mary' }), 'service')).toBeNull();
  });

  it('agrees with sendCardStatus about which moments need a detail', () => {
    const cases: Array<[Session, MomentKey]> = [
      [session(), 'announce'],
      [session(), 'service'],
      [session(), 'obituary'],
      [session(), 'thanks'],
      [session({ obituaryUrl: 'https://example.com/anna' }), 'obituary'],
      [session({ serviceDate: 'June 14, 2026', serviceTime: '2:00 PM', servicePlace: 'St Mary' }), 'service'],
    ];
    for (const [s, key] of cases) {
      const status = sendCardStatus(s, key);
      expect(firstMissingField(s, key) !== null).toBe(status === 'needsDetail' || status === 'waitingForLink');
    }
  });
});

describe('fieldPhrase', () => {
  it('lowercases the first letter so the label reads inside a sentence', () => {
    expect(fieldPhrase('Service date and time')).toBe('service date and time');
    expect(fieldPhrase('Obituary link')).toBe('obituary link');
  });
});
