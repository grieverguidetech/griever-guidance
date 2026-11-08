import { describe, expect, it } from 'vitest';
import { parseDetailsBody, parseSuggestBody } from './validate.js';

const token = 'abcdefghijklmnop1234';
const ok = { input: 'Smith Funeral', sessionToken: token };

describe('parseSuggestBody', () => {
  it('accepts a minimal body and an empty types list', () => {
    expect(parseSuggestBody(ok)).toEqual({ input: 'Smith Funeral', types: [], sessionToken: token });
    expect(parseSuggestBody({ ...ok, types: [] })?.types).toEqual([]);
  });

  it('trims the input', () => {
    expect(parseSuggestBody({ ...ok, input: '  abc  ' })?.input).toBe('abc');
  });

  it.each([
    ['null', null],
    ['an array', []],
    ['a missing input', { sessionToken: token }],
    ['a 2-character input after trimming', { ...ok, input: ' ab ' }],
    ['a 201-character input', { ...ok, input: 'a'.repeat(201) }],
    ['a non-string input', { ...ok, input: 5 }],
    ['an unknown type', { ...ok, types: ['bar'] }],
    ['6 types', { ...ok, types: ['funeral_home', 'church', 'synagogue', 'mosque', 'hindu_temple', 'cemetery'] }],
    ['a duplicate type', { ...ok, types: ['church', 'church'] }],
    ['types that is not an array', { ...ok, types: 'church' }],
    ['an extra key', { ...ok, extra: 1 }],
    ['a short session token', { ...ok, sessionToken: 'short' }],
    ['a session token with bad characters', { ...ok, sessionToken: 'abcdefghijklmnop12/4' }],
    ['a missing session token', { input: 'abc' }],
  ])('rejects %s', (_name, body) => {
    expect(parseSuggestBody(body)).toBeNull();
  });
});

describe('parseDetailsBody', () => {
  const good = { placeId: 'ChIJabc_-123', sessionToken: token };

  it('accepts a valid body', () => {
    expect(parseDetailsBody(good)).toEqual(good);
  });

  it.each([
    ['a 301-character place id', { ...good, placeId: 'a'.repeat(301) }],
    ['an empty place id', { ...good, placeId: '' }],
    ['a slash', { ...good, placeId: 'a/b' }],
    ['a question mark', { ...good, placeId: 'a?b=1' }],
    ['dot dot', { ...good, placeId: '..' }],
    ['a bad session token', { ...good, sessionToken: 'x' }],
    ['an extra key', { ...good, input: 'x' }],
    ['a non-object', 'text'],
  ])('rejects %s', (_name, body) => {
    expect(parseDetailsBody(body)).toBeNull();
  });
});
