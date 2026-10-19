import { describe, expect, it } from '@jest/globals';
import { sendNote } from './sendNote';

const r = (...s: ('delivered' | 'skipped')[]) => s.map((status, i) => ({ contactId: `c${i}`, status }));

describe('sendNote', () => {
  it('has one line per moment when everyone was told', () => {
    expect(sendNote('announcement', r('delivered'))).toBe('Everyone has been told.');
    expect(sendNote('service', r('delivered'))).toBe('The service details have been shared.');
    expect(sendNote('obituary', r('delivered'))).toBe('The obituary has been shared.');
    expect(sendNote('aftercare', r('delivered'))).toBe('Your thank-yous have been sent.');
  });

  it('says how many were told when anyone was skipped', () => {
    expect(sendNote('announcement', r('delivered', 'skipped', 'delivered'))).toBe(
      'You told 2 of 3. You can text the others from your own Messages app any time.',
    );
  });

  it('never uses an exclamation point', () => {
    for (const c of ['announcement', 'service', 'obituary', 'aftercare', null] as const) {
      expect(sendNote(c, r('delivered'))).not.toContain('!');
    }
  });
});
