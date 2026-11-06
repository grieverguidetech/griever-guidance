import { describe, expect, it } from '@jest/globals';
import type { Session } from '@griever/hooks';
import { nextMoment, serviceIsOver } from './nextMoment';

const NOW = new Date(2026, 10, 5, 12, 0, 0); // November 5, 2026, local

const base = {
  personName: 'Anna',
  dateOfPassing: 'October 30, 2026',
  senderName: 'Sam',
  obituaryUrl: '',
  serviceDate: '',
  serviceTime: '2:00 PM',
  servicePlace: 'St. Mark',
  drafts: {},
  recipientsNotified: {},
} as unknown as Session;

const session = (extra: object = {}): Session => ({ ...base, ...extra }) as Session;
const told = { recipientsNotified: { announcement: ['c1'] } };
const serviceReady = { serviceDate: 'November 8, 2026', serviceReady: true };

describe('nextMoment', () => {
  it('lights the announcement first when nothing is done', () => {
    expect(nextMoment({ session: session(), locked: [], now: NOW })).toBe('announce');
  });

  it('moves to the service once the announcement is done and the service is ready', () => {
    expect(nextMoment({ session: session({ ...told, ...serviceReady }), locked: [], now: NOW })).toBe('service');
  });

  it('skips a card that needs a detail', () => {
    expect(nextMoment({ session: session({ ...told, serviceTime: '' }), locked: [], now: NOW })).toBeNull();
  });

  it('skips locked cards and never lights them', () => {
    const s = session({ ...told, ...serviceReady });
    expect(nextMoment({ session: s, locked: ['service'], now: NOW })).toBeNull();
  });

  it('falls back to null when no card qualifies', () => {
    expect(nextMoment({ session: session({ recipientsNotified: { announcement: ['c1'] } }), locked: ['service', 'thanks'], now: NOW })).toBeNull();
  });

  it('lights the thank-yous only after the service date', () => {
    const done = { recipientsNotified: { announcement: ['a'], service: ['b'], obituary: ['c'] }, obituaryUrl: 'https://x.test/o' };
    expect(nextMoment({ session: session({ ...done, serviceDate: 'November 4, 2026' }), locked: [], now: NOW })).toBe('thanks');
    expect(nextMoment({ session: session({ ...done, serviceDate: 'November 5, 2026' }), locked: [], now: NOW })).toBeNull();
    expect(nextMoment({ session: session({ ...done, serviceDate: 'November 8, 2026' }), locked: [], now: NOW })).toBeNull();
  });

  it('never lights the thank-yous for a missing or unparsable date', () => {
    const done = { recipientsNotified: { announcement: ['a'], service: ['b'], obituary: ['c'] }, obituaryUrl: 'https://x.test/o' };
    expect(nextMoment({ session: session({ ...done, serviceDate: 'next Saturday' }), locked: [], now: NOW })).toBeNull();
    expect(nextMoment({ session: session({ ...done, serviceDate: '' }), locked: [], now: NOW })).toBeNull();
  });

  it('lights the obituary when its text is written and only the link is missing', () => {
    const s = session({ recipientsNotified: { announcement: ['a'], service: ['b'] }, obituaryText: 'Anna loved the garden.' });
    expect(nextMoment({ session: s, locked: [], now: NOW })).toBe('obituary');
  });

  it('does not light the obituary when it needs a detail', () => {
    const s = session({ recipientsNotified: { announcement: ['a'], service: ['b'] } });
    expect(nextMoment({ session: s, locked: [], now: NOW })).toBeNull();
  });

  it('lights a stopped send, even though some people were told', () => {
    expect(nextMoment({ session: session(told), locked: [], partial: 'announce', now: NOW })).toBe('announce');
  });

  it('does not light a stopped send for a locked card', () => {
    expect(nextMoment({ session: session(told), locked: ['service'], partial: 'service', now: NOW })).toBeNull();
  });
});

describe('serviceIsOver', () => {
  it('reads an ISO date as that calendar day', () => {
    expect(serviceIsOver('2026-11-04', NOW)).toBe(true);
    expect(serviceIsOver('2026-11-05', NOW)).toBe(false);
  });

  it('is false for text that is not a date, or nothing', () => {
    expect(serviceIsOver('next Saturday', NOW)).toBe(false);
    expect(serviceIsOver(undefined, NOW)).toBe(false);
    expect(serviceIsOver('   ', NOW)).toBe(false);
  });
});
