import { describe, expect, it } from '@jest/globals';
import { defaultPicked, everyoneYouTold, notSentYet, startsFresh } from './defaultRecipients';

describe('everyoneYouTold', () => {
  it('returns announcement recipients who are still saved', () => {
    expect(everyoneYouTold('service', { announcement: ['a', 'b'] }, ['a', 'b', 'c'])).toEqual(['a', 'b']);
  });

  it('keeps the announcement order', () => {
    expect(everyoneYouTold('service', { announcement: ['b', 'a'] }, ['a', 'b'])).toEqual(['b', 'a']);
  });

  it('skips people who are no longer saved', () => {
    expect(everyoneYouTold('service', { announcement: ['a', 'gone', 'b'] }, ['a', 'b'])).toEqual(['a', 'b']);
  });

  it('has no told set for the announcement itself', () => {
    expect(everyoneYouTold('announcement', { announcement: ['a'] }, ['a'])).toEqual([]);
  });

  it('gives [] when nobody was notified', () => {
    expect(everyoneYouTold('obituary', undefined, ['a'])).toEqual([]);
    expect(everyoneYouTold('obituary', {}, ['a'])).toEqual([]);
    expect(everyoneYouTold('obituary', { announcement: [] }, ['a'])).toEqual([]);
  });

  it('has no duplicates', () => {
    expect(everyoneYouTold('service', { announcement: ['a', 'a', 'b'] }, ['a', 'b'])).toEqual(['a', 'b']);
  });
});

describe('notSentYet', () => {
  it('leaves out the people this moment has reached', () => {
    expect(notSentYet('service', { service: ['a'] }, ['a', 'b', 'c'])).toEqual(['b', 'c']);
  });

  it('works for the announcement itself', () => {
    expect(notSentYet('announcement', { announcement: ['a'] }, ['a', 'b'])).toEqual(['b']);
  });

  it('gives [] when this moment has reached nobody saved', () => {
    expect(notSentYet('service', {}, ['a', 'b'])).toEqual([]);
    expect(notSentYet('service', { service: ['gone'] }, ['a', 'b'])).toEqual([]);
    expect(notSentYet('service', undefined, ['a'])).toEqual([]);
  });

  it('gives [] when everyone saved was reached', () => {
    expect(notSentYet('service', { service: ['a', 'b'] }, ['a', 'b'])).toEqual([]);
  });

  it('has no duplicates', () => {
    expect(notSentYet('service', { service: ['a'] }, ['a', 'b', 'b'])).toEqual(['b']);
  });
});

describe('defaultPicked', () => {
  const notified = { announcement: ['a', 'b', 'gone'] };
  const saved = ['a', 'b', 'c'];

  it('picks everyone you told for the service and the obituary link', () => {
    expect(defaultPicked('service', notified, saved)).toEqual(['a', 'b']);
    expect(defaultPicked('obituary', notified, saved)).toEqual(['a', 'b']);
  });

  it('picks nobody for the announcement and the thank-yous', () => {
    expect(defaultPicked('announcement', notified, saved)).toEqual([]);
    expect(defaultPicked('aftercare', notified, saved)).toEqual([]);
  });

  it('leaves out a person who is in both the announcement and the service', () => {
    expect(defaultPicked('service', { announcement: ['a', 'b'], service: ['a'] }, saved)).toEqual(['b']);
    expect(defaultPicked('obituary', { announcement: ['a', 'b'], obituary: ['b'] }, saved)).toEqual(['a']);
  });

  it('picks nobody when nobody qualifies', () => {
    expect(defaultPicked('service', undefined, saved)).toEqual([]);
    expect(defaultPicked('service', { announcement: ['gone'] }, saved)).toEqual([]);
    expect(defaultPicked('service', { announcement: ['a'], service: ['a'] }, saved)).toEqual([]);
  });
});

describe('startsFresh', () => {
  it('is true with no draft, a draft only opened, or a finished send', () => {
    expect(startsFresh(undefined)).toBe(true);
    expect(startsFresh({ step: 'template' })).toBe(true);
    expect(startsFresh({ step: 'sent' })).toBe(true);
  });

  it('is false once a draft has moved past the picker, including mid-send', () => {
    expect(startsFresh({ step: 'review' })).toBe(false);
    expect(startsFresh({ step: 'contacts' })).toBe(false);
    expect(startsFresh({ step: 'sending' })).toBe(false);
  });
});
