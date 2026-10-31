import { isValidBirthDate, isValidFullName, normalizeFullName } from './profileFields.js';

describe('isValidFullName', () => {
  it('accepts normal names, emoji at the limit, and the empty string', () => {
    expect(isValidFullName('Ada Lovelace')).toBe(true);
    expect(isValidFullName('😀'.repeat(120))).toBe(true);
    expect(isValidFullName('')).toBe(true);
  });

  it('refuses over-long, control characters and non-strings', () => {
    expect(isValidFullName('x'.repeat(121))).toBe(false);
    expect(isValidFullName('Ada\u0000')).toBe(false);
    expect(isValidFullName('Ada\u001f')).toBe(false);
    expect(isValidFullName('Ada\nKing')).toBe(false);
    expect(isValidFullName('Ada\rKing')).toBe(false);
    expect(isValidFullName('Ada\tKing')).toBe(false);
    expect(isValidFullName(5)).toBe(false);
    expect(isValidFullName(null)).toBe(false);
  });
});

describe('isValidBirthDate', () => {
  const today = '2026-10-31';

  it('accepts real past dates, today, 1900-01-01 and a leap day', () => {
    expect(isValidBirthDate('1980-05-17', today)).toBe(true);
    expect(isValidBirthDate('2026-10-31', today)).toBe(true);
    expect(isValidBirthDate('1900-01-01', today)).toBe(true);
    expect(isValidBirthDate('2000-02-29', today)).toBe(true);
  });

  it.each([
    ['future', '2026-11-01'],
    ['before 1900', '1899-12-31'],
    ['not a leap year', '2001-02-29'],
    ['month 13', '1990-13-01'],
    ['day 0', '1990-01-00'],
    ['wrong format', '17/05/1980'],
    ['no zero padding', '1990-1-1'],
    ['trailing text', '1990-01-01x'],
  ])('refuses %s', (_label, value) => {
    expect(isValidBirthDate(value, today)).toBe(false);
  });

  it('refuses non-strings', () => {
    expect(isValidBirthDate(19800517, today)).toBe(false);
    expect(isValidBirthDate(null, today)).toBe(false);
  });
});

describe('normalizeFullName', () => {
  it('trims, and turns blank into null', () => {
    expect(normalizeFullName('  Ada King  ')).toBe('Ada King');
    expect(normalizeFullName('')).toBeNull();
    expect(normalizeFullName('   ')).toBeNull();
    expect(normalizeFullName(null)).toBeNull();
  });

  it('leaves non-strings for the validator to refuse', () => {
    expect(normalizeFullName(5)).toBe(5);
  });
});
