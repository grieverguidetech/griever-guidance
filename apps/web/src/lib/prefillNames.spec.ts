import { lacksFirstName, markPrefilled, namesToPrefill, wasPrefilled } from './prefillNames';

describe('namesToPrefill', () => {
  const clerk = { firstName: ' Anna ', lastName: 'Reyes' };

  it('uses the trimmed Clerk names for a profile with none', () => {
    expect(namesToPrefill(null, clerk)).toEqual({ firstName: 'Anna', lastName: 'Reyes' });
    expect(namesToPrefill({ firstName: null, lastName: null, senderName: ' ' }, clerk)).toEqual({ firstName: 'Anna', lastName: 'Reyes' });
  });

  it('leaves the last name out when Clerk has none', () => {
    expect(namesToPrefill(null, { firstName: 'Anna', lastName: ' ' })).toEqual({ firstName: 'Anna', lastName: null });
  });

  it('saves nothing without a Clerk first name', () => {
    expect(namesToPrefill(null, undefined)).toBeNull();
    expect(namesToPrefill(null, { firstName: null, lastName: 'Reyes' })).toBeNull();
  });

  it('never overwrites a name the profile has', () => {
    expect(namesToPrefill({ firstName: 'Ann' }, clerk)).toBeNull();
    expect(namesToPrefill({ lastName: 'Lee' }, clerk)).toBeNull();
    expect(namesToPrefill({ senderName: 'Ann' }, clerk)).toBeNull();
  });
});

describe('lacksFirstName', () => {
  it('is true only with no first name and no sender name', () => {
    expect(lacksFirstName(null)).toBe(true);
    expect(lacksFirstName({ firstName: ' ', senderName: null })).toBe(true);
    expect(lacksFirstName({ firstName: 'Anna' })).toBe(false);
    expect(lacksFirstName({ firstName: null, senderName: 'Anna' })).toBe(false);
  });
});

describe('the prefilled marker', () => {
  it('remembers the user, and is false for another one', () => {
    window.localStorage.clear();
    expect(wasPrefilled(window.localStorage, 'u1')).toBe(false);
    markPrefilled(window.localStorage, 'u1');
    expect(wasPrefilled(window.localStorage, 'u1')).toBe(true);
    expect(wasPrefilled(window.localStorage, 'u2')).toBe(false);
  });

  it('survives blocked storage', () => {
    const blocked = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    expect(wasPrefilled(blocked, 'u1')).toBe(false);
    expect(() => markPrefilled(blocked, 'u1')).not.toThrow();
  });
});
