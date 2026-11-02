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
  it('strips punctuation at the ends and checks again', () => {
    expect(firstName('(Mom)')).toBe('Mom');
    expect(firstName('"Anna" Lee')).toBe('Anna');
    expect(firstName('(555)')).toBe('');
  });
  it('uses the word after the comma in "Last, First"', () => {
    expect(firstName('Lee, Anna')).toBe('Anna');
    expect(firstName('Lee,')).toBe('Lee');
  });
  it('gives nothing for a title', () => {
    expect(firstName('Dr. Lee')).toBe('');
    expect(firstName('mrs Lee')).toBe('');
    expect(firstName('Prof Lee')).toBe('');
    expect(firstName('Rev. Sam Lee')).toBe('');
  });
  it('keeps a kinship word with the name after it', () => {
    expect(firstName('Aunt Sue')).toBe('Aunt Sue');
    expect(firstName('uncle Bob Lee')).toBe('uncle Bob');
    expect(firstName('Grandma')).toBe('Grandma');
    expect(firstName('Cousin 2')).toBe('Cousin');
  });
  it('keeps accented names', () => {
    expect(firstName('Zoë Kim')).toBe('Zoë');
  });
});

describe('withGreeting', () => {
  it('puts the name on its own first line', () => {
    expect(withGreeting('Anna', 'We wanted you to know.')).toBe('Anna,\nWe wanted you to know.');
  });
  it('does not double a greeting already there', () => {
    expect(withGreeting('Anna', 'Anna,\nWe wanted you to know.')).toBe('Anna,\nWe wanted you to know.');
  });
  it('leaves the message alone with no name', () => {
    expect(withGreeting('', 'We wanted you to know.')).toBe('We wanted you to know.');
  });
});
