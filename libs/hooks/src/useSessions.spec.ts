import type { Session } from './useSessions.js';
import { CONTACT_RETENTION_DAYS, getContactsRetentionExpiry } from './useSessions.js';

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
