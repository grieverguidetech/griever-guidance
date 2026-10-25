import { decodeProfile, encodeProfile, type Profile } from './profileItem.js';

const full: Profile = {
  userId: 'u1',
  senderName: 'Sam',
  contactSource: 'manual',
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
        'accountType',
        'version',
        'createdAt',
        'updatedAt',
      ].sort(),
    );
  });

  it('round-trips, and leaves optional fields out when they are not set', () => {
    expect(decodeProfile(encodeProfile(full))).toEqual(full);
    const { senderName: _s, contactSource: _c, ...bare } = full;
    expect(decodeProfile(encodeProfile(bare))).toEqual(bare);
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
