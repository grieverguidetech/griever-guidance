import { dateNote } from './index.js';

const today = new Date(2026, 9, 30);

describe('dateNote', () => {
  it('says nothing for empty text', () => {
    expect(dateNote('', { field: 'event' })).toBeNull();
    expect(dateNote('  ', { field: 'birth' })).toBeNull();
    expect(dateNote(undefined, { field: 'passing', today })).toBeNull();
  });

  it('flags text that is not a date', () => {
    expect(dateNote('sometime soon', { field: 'event' })).toBe('unreadable');
    expect(dateNote('Mayy', { field: 'passing', today })).toBe('unreadable');
  });

  it('does not judge a partial date still being typed', () => {
    expect(dateNote('May 2', { field: 'event', dateOfPassing: 'May 29, 2026' })).toBeNull();
  });

  it('flags a date of passing after today, but not today or earlier', () => {
    expect(dateNote('November 2, 2026', { field: 'passing', today })).toBe('futurePassing');
    expect(dateNote('October 30, 2026', { field: 'passing', today })).toBeNull();
    expect(dateNote('May 29, 2026', { field: 'passing', today })).toBeNull();
  });

  it('flags an event before the date of passing, but not the same day or later', () => {
    const dateOfPassing = 'May 29, 2026';
    expect(dateNote('May 20, 2026', { field: 'event', dateOfPassing })).toBe('beforePassing');
    expect(dateNote('May 29, 2026', { field: 'event', dateOfPassing })).toBeNull();
    expect(dateNote('June 3, 2026', { field: 'event', dateOfPassing })).toBeNull();
  });

  it('compares ISO and typed formats by calendar day', () => {
    expect(dateNote('2026-05-28', { field: 'event', dateOfPassing: 'May 29, 2026' })).toBe('beforePassing');
    expect(dateNote('2026-05-29', { field: 'event', dateOfPassing: 'May 29, 2026' })).toBeNull();
  });

  it('flags a birth date after the date of passing', () => {
    expect(dateNote('June 1, 2026', { field: 'birth', dateOfPassing: 'May 29, 2026' })).toBe('birthAfterPassing');
    expect(dateNote('March 3, 1950', { field: 'birth', dateOfPassing: 'May 29, 2026' })).toBeNull();
  });

  it('skips the ordering checks when the date of passing is missing or unreadable', () => {
    expect(dateNote('May 20, 2026', { field: 'event' })).toBeNull();
    expect(dateNote('May 20, 2026', { field: 'event', dateOfPassing: 'unknown' })).toBeNull();
    expect(dateNote('June 1, 2026', { field: 'birth', dateOfPassing: '' })).toBeNull();
  });
});
