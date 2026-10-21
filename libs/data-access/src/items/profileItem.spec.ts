import { fixedClock } from '../clock.js';
import { getLive, isLive, queryLive } from '../read.js';
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

describe('ttl read filter', () => {
  const clock = fixedClock('2026-10-21T12:00:00.000Z');
  const nowSeconds = Date.parse('2026-10-21T12:00:00.000Z') / 1000;

  it('drops items whose ttl is at or before now, and keeps later and missing ttl', () => {
    expect(isLive({ ttl: nowSeconds - 1 }, clock)).toBe(false);
    expect(isLive({ ttl: nowSeconds }, clock)).toBe(false);
    expect(isLive({ ttl: nowSeconds + 1 }, clock)).toBe(true);
    expect(isLive({}, clock)).toBe(true);
  });

  it('applies the filter in getLive and queryLive', async () => {
    const items = [{ id: 'old', ttl: nowSeconds - 10 }, { id: 'new', ttl: nowSeconds + 10 }, { id: 'none' }];
    const doc = {
      send: async (command: { constructor: { name: string } }) =>
        command.constructor.name === 'GetCommand' ? { Item: items[0] } : { Items: items },
    };
    expect(await getLive(doc as never, 't', { pk: 'a', sk: 'b' }, clock)).toBeUndefined();
    const live = await queryLive(doc as never, 't', 'a', clock);
    expect(live.map((i) => i['id'])).toEqual(['new', 'none']);
  });
});
