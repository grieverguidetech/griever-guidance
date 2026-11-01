import { checkAddress, isValidBirthDate, isValidFullName, isValidNamePart, normalizeFullName, splitFullName } from './profileFields.js';

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

describe('isValidNamePart', () => {
  it('accepts a name up to 100 characters and refuses more, control characters and non-strings', () => {
    expect(isValidNamePart('Anna')).toBe(true);
    expect(isValidNamePart('😀'.repeat(100))).toBe(true);
    expect(isValidNamePart('x'.repeat(101))).toBe(false);
    expect(isValidNamePart('Anna\nLee')).toBe(false);
    expect(isValidNamePart('Anna\u0000')).toBe(false);
    expect(isValidNamePart(7)).toBe(false);
  });
});

describe('splitFullName', () => {
  it('uses the last word as the last name', () => {
    expect(splitFullName('Sam Smith')).toEqual({ firstName: 'Sam', lastName: 'Smith' });
    expect(splitFullName('  Mary  Ann   van Dyke ')).toEqual({ firstName: 'Mary Ann van', lastName: 'Dyke' });
  });

  it('keeps one word as the first name, and blank as nothing', () => {
    expect(splitFullName('Sam')).toEqual({ firstName: 'Sam', lastName: null });
    expect(splitFullName('   ')).toEqual({ firstName: null, lastName: null });
    expect(splitFullName(null)).toEqual({ firstName: null, lastName: null });
  });
});

describe('checkAddress', () => {
  const full = { line1: '12 Oak St', line2: 'Apt 4', city: 'Bentonville', state: 'AR', zip: '72712' };

  it('accepts a full address and a 5+4 ZIP, trims, and upper-cases the state', () => {
    expect(checkAddress(full)).toEqual({ ok: true, address: full });
    expect(checkAddress({ ...full, zip: '72712-1234' })).toMatchObject({ ok: true });
    expect(checkAddress({ ...full, line1: ' 12 Oak St ', state: 'ar' })).toEqual({ ok: true, address: full });
  });

  it('treats a missing line 2 as empty, and a blank or missing address as no address', () => {
    expect(checkAddress({ ...full, line2: undefined })).toEqual({ ok: true, address: { ...full, line2: '' } });
    expect(checkAddress(null)).toEqual({ ok: true, address: null });
    expect(checkAddress({ line1: ' ', line2: '', city: '', state: '', zip: '' })).toEqual({ ok: true, address: null });
  });

  it('names each required field that is empty when the address is partly filled', () => {
    expect(checkAddress({ line1: '12 Oak St' })).toEqual({ ok: false, errors: { city: 'required', state: 'required', zip: 'required' } });
  });

  it('refuses a bad state, ZIP, long or multi-line text, and the wrong shape', () => {
    expect(checkAddress({ ...full, state: 'Ark' })).toEqual({ ok: false, errors: { state: 'badState' } });
    expect(checkAddress({ ...full, state: '12' })).toEqual({ ok: false, errors: { state: 'badState' } });
    expect(checkAddress({ ...full, zip: '7271' })).toEqual({ ok: false, errors: { zip: 'badZip' } });
    expect(checkAddress({ ...full, zip: '72712-12' })).toEqual({ ok: false, errors: { zip: 'badZip' } });
    expect(checkAddress({ ...full, line1: 'x'.repeat(101) })).toEqual({ ok: false, errors: { line1: 'tooLong' } });
    expect(checkAddress({ ...full, city: 'y'.repeat(61) })).toEqual({ ok: false, errors: { city: 'tooLong' } });
    expect(checkAddress({ ...full, line2: 'a\nb' })).toEqual({ ok: false, errors: { line2: 'badChars' } });
    expect(checkAddress({ ...full, city: 'Ben\u0000' })).toEqual({ ok: false, errors: { city: 'badChars' } });
    expect(checkAddress({ ...full, zip: 72712 })).toEqual({ ok: false, errors: { zip: 'invalid' } });
    expect(checkAddress('12 Oak St')).toEqual({ ok: false, errors: { address: 'invalid' } });
    expect(checkAddress([])).toEqual({ ok: false, errors: { address: 'invalid' } });
    expect(checkAddress({ ...full, country: 'US' })).toEqual({ ok: false, errors: { address: 'invalid' } });
  });
});
