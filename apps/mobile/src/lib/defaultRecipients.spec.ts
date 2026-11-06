import { describe, expect, it } from '@jest/globals';
import { everyoneYouTold, notSentYet } from './defaultRecipients';

describe('everyoneYouTold', () => {
  it('returns announcement recipients who are still saved', () => {
    expect(everyoneYouTold('service', { announcement: ['a', 'b'] }, ['a', 'b', 'c'])).toEqual(['a', 'b']);
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
