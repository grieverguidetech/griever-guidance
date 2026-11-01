import { decodeProfile, encodeProfile, type Profile } from './profileItem.js';

const full: Profile = {
  userId: 'u1',
  senderName: 'Sam',
  contactSource: 'manual',
  firstName: 'Sam',
  lastName: 'Smith',
  birthDate: '1980-05-17',
  address: { line1: '12 Oak St', line2: '', city: 'Bentonville', state: 'AR', zip: '72712' },
  accountType: 'owner',
  version: 3,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-02T00:00:00.000Z',
};

describe('profile codec', () => {
  it('writes exactly the attributes in design 1.2', () => {
    expect(Object.keys(encodeProfile(full)).sort()).toEqual(
      [
        'pk',
        'sk',
        'entity',
        'userId',
        'senderName',
        'contactSource',
        'firstName',
        'lastName',
        'birthDate',
        'address',
        'accountType',
        'version',
        'createdAt',
        'updatedAt',
      ].sort(),
    );
  });

  it('round-trips, and leaves optional fields out when they are not set', () => {
    expect(decodeProfile(encodeProfile(full))).toEqual(full);
    const { senderName: _s, contactSource: _c, firstName: _f, lastName: _l, birthDate: _b, address: _a, ...bare } = full;
    expect(decodeProfile(encodeProfile(bare))).toEqual(bare);
  });

  it('splits a legacy fullName on read, and prefers firstName and lastName when they exist', () => {
    const base = encodeProfile({ ...full, firstName: undefined, lastName: undefined });
    expect(decodeProfile({ ...base, fullName: 'Mary Ann Dyke' })).toMatchObject({ firstName: 'Mary Ann', lastName: 'Dyke' });
    expect(decodeProfile({ ...base, fullName: 'Sam' })).toMatchObject({ firstName: 'Sam' });
    expect(decodeProfile({ ...base, fullName: 'Old Name', firstName: 'New' })).toMatchObject({ firstName: 'New' });
    expect(decodeProfile({ ...base, fullName: 'Old Name', firstName: 'New' })).not.toHaveProperty('lastName');
  });

  it('drops a broken address instead of returning it', () => {
    expect(decodeProfile({ ...encodeProfile(full), address: { line1: 'x' } })).not.toHaveProperty('address');
  });

  it('never carries an email, contact or message attribute', () => {
    const keys = Object.keys(encodeProfile(full)).join(' ').toLowerCase();
    for (const word of ['email', 'contact_', 'message', 'draft', 'phone']) expect(keys).not.toContain(word);
  });
});

describe('decodeProfile', () => {
  it('throws on a broken item', () => {
    const good = encodeProfile(full);
    for (const patch of [{ userId: 5 }, { accountType: 'admin' }, { version: '3' }, { createdAt: undefined }, { updatedAt: 1 }]) {
      expect(() => decodeProfile({ ...good, ...patch })).toThrow();
    }
  });
});
