import { describe, expect, it } from '@jest/globals';
import { sendNote } from './sendNote';

const r = (...s: ('delivered' | 'skipped')[]) => s.map((status, i) => ({ contactId: `c${i}`, status }));
const NO_COPY = "We don't keep a copy of what was sent — it's already where it belongs, in your own Messages app.";

describe('sendNote', () => {
  it('has one lead per moment when everyone was told, and the privacy line as the rest', () => {
    expect(sendNote('announcement', r('delivered'))).toEqual({
      lead: 'Everyone has been told.',
      rest: NO_COPY,
      spoken: `Everyone has been told. ${NO_COPY}`,
    });
    expect(sendNote('service', r('delivered')).lead).toBe('The service details have been shared.');
    expect(sendNote('obituary', r('delivered')).lead).toBe('The obituary has been shared.');
    expect(sendNote('aftercare', r('delivered')).lead).toBe('Your thank-yous have been sent.');
    expect(sendNote('obituary', r('delivered')).rest).toBe(NO_COPY);
  });

  it('says how many were told when anyone was skipped', () => {
    expect(sendNote('announcement', r('delivered', 'skipped', 'delivered'))).toEqual({
      lead: 'You told 2 of 3.',
      rest: `You can text the others from your own Messages app any time. ${NO_COPY}`,
      spoken: `You told 2 of 3. You can text the others from your own Messages app any time. ${NO_COPY}`,
    });
  });

  it('leaves out the privacy line when no one was texted', () => {
    expect(sendNote('announcement', r('skipped', 'skipped'))).toEqual({
      lead: 'No one was texted this time.',
      rest: 'You can come back to this any time.',
      spoken: 'No one was texted this time. You can come back to this any time.',
    });
  });

  it('does not say "0 of 0" when there are no recipients', () => {
    expect(sendNote('announcement', []).lead).toBe('Everyone has been told.');
  });

  it('never uses an exclamation point', () => {
    for (const c of ['announcement', 'service', 'obituary', 'aftercare', null] as const) {
      const n = sendNote(c, r('delivered'));
      expect(`${n.lead} ${n.rest}`).not.toContain('!');
    }
  });
});
