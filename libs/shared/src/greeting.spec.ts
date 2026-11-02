import { describe, expect, it } from 'vitest';
import { firstName, withGreeting } from './greeting.js';

describe('firstName', () => {
  it('returns the first word', () => {
    expect(firstName('Anna Lee')).toBe('Anna');
    expect(firstName('  bo ')).toBe('bo');
  });
  it('returns an empty string when there is nothing to greet', () => {
    expect(firstName('')).toBe('');
    expect(firstName('   ')).toBe('');
    expect(firstName('+1617555')).toBe('');
    expect(firstName('Anna2 Lee')).toBe('');
    expect(firstName('--')).toBe('');
  });
  it('keeps accented names', () => {
    expect(firstName('Zoë Kim')).toBe('Zoë');
  });
});

describe('withGreeting', () => {
  it('puts the name on its own first line', () => {
    expect(withGreeting('Anna', 'We wanted you to know.')).toBe('Anna,\nWe wanted you to know.');
  });
  it('leaves the message alone with no name', () => {
    expect(withGreeting('', 'We wanted you to know.')).toBe('We wanted you to know.');
  });
});
