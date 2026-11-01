import { fixedClock } from '../clock';
import { encodeProfile } from '../items/profileItem';
import {
  createTables,
  doc,
  dropTables,
  rawPut,
  table,
  up,
} from '../testing/localTable';
import { getProfile, parseProfileFields, putProfile } from './profiles.js';

const clock = fixedClock('2026-10-24T00:00:00.000Z');
const caller = (userId: string) => ({
  userId,
  email: 'someone@example.test',
  emailVerified: true,
});

describe.runIf(up)('profile rules on DynamoDB Local', () => {
  beforeAll(createTables);
  afterAll(dropTables);

  it('gives null when the caller has no profile', async () => {
    expect(
      await getProfile(doc, table, caller('user_p_none'), clock),
    ).toBeNull();
  });

  it("creates the caller's profile as owner and changes no one else's", async () => {
    const result = await putProfile(
      doc,
      table,
      caller('user_p_new'),
      { senderName: 'Sam' },
      clock,
    );
    expect(result).toEqual({
      ok: true,
      value: expect.objectContaining({
        userId: 'user_p_new',
        senderName: 'Sam',
        accountType: 'owner',
      }),
    });
    expect(
      await getProfile(doc, table, caller('user_p_other'), clock),
    ).toBeNull();
  });

  it('never changes accountType, version or createdAt', async () => {
    const at = '2026-10-01T00:00:00.000Z';
    await rawPut(
      encodeProfile({
        userId: 'user_p_member',
        accountType: 'member',
        version: 4,
        createdAt: at,
        updatedAt: at,
      }),
    );
    await putProfile(
      doc,
      table,
      caller('user_p_member'),
      { contactSource: 'manual' },
      clock,
    );
    expect(
      await getProfile(doc, table, caller('user_p_member'), clock),
    ).toMatchObject({
      accountType: 'member',
      version: 4,
      createdAt: at,
      contactSource: 'manual',
    });
  });

  it('clears a field when it is set to null', async () => {
    await putProfile(
      doc,
      table,
      caller('user_p_clear'),
      { senderName: 'Sam' },
      clock,
    );
    await putProfile(
      doc,
      table,
      caller('user_p_clear'),
      { senderName: null },
      clock,
    );
    const profile = await getProfile(doc, table, caller('user_p_clear'), clock);
    expect(profile).not.toHaveProperty('senderName');
  });

  it('stores and returns names, birth date and address, and clears them with null', async () => {
    const id = caller('user_p_private');
    const address = { line1: '12 Oak St', line2: '', city: 'Bentonville', state: 'AR', zip: '72712' };
    await putProfile(doc, table, id, { firstName: 'Sam', lastName: 'Smith', birthDate: '1980-05-17', address }, clock);
    expect(await getProfile(doc, table, id, clock)).toMatchObject({
      firstName: 'Sam',
      lastName: 'Smith',
      senderName: 'Sam',
      birthDate: '1980-05-17',
      address,
    });
    await putProfile(doc, table, id, { firstName: null, lastName: null, birthDate: null, address: null }, clock);
    const cleared = await getProfile(doc, table, id, clock);
    for (const key of ['firstName', 'lastName', 'senderName', 'birthDate', 'address']) {
      expect(cleared).not.toHaveProperty(key);
    }
  });

  it('splits a legacy stored fullName on read, and drops it once a name is saved', async () => {
    const id = caller('user_p_legacy');
    await rawPut({ ...encodeProfile({ userId: id.userId, accountType: 'owner', version: 0, createdAt: 'a', updatedAt: 'a' }), fullName: 'Sam Smith' });
    expect(await getProfile(doc, table, id, clock)).toMatchObject({ firstName: 'Sam', lastName: 'Smith' });
    await putProfile(doc, table, id, { lastName: 'Jones' }, clock);
    const after = await getProfile(doc, table, id, clock);
    expect(after).toMatchObject({ lastName: 'Jones' });
    expect(after).not.toHaveProperty('firstName');
  });

  it('keeps the old fullName and senderName path working for older clients', async () => {
    const id = caller('user_p_old');
    await putProfile(doc, table, id, { senderName: 'Annie', fullName: 'Anna Lee' }, clock);
    expect(await getProfile(doc, table, id, clock)).toMatchObject({ senderName: 'Annie', firstName: 'Anna', lastName: 'Lee' });
  });

  it('counts characters, not code units, for the name limit', async () => {
    const result = await putProfile(
      doc,
      table,
      caller('user_p_emoji'),
      { senderName: '🌷'.repeat(100) },
      clock,
    );
    expect(result.ok).toBe(true);
  });

  it('refuses keys it does not own and values over the limits', async () => {
    const bad = [
      { accountType: 'owner' },
      { version: 9 },
      { userId: 'user_x' },
      { createdAt: 'x' },
      { senderName: 'x'.repeat(101) },
      { contactSource: 'phone' },
      { fullName: 'x'.repeat(121) },
      { fullName: 'Sam\u0000' },
      { firstName: 'x'.repeat(101) },
      { lastName: 'Lee\nSmith' },
      { address: { line1: '12 Oak St' } },
      { address: { line1: '12 Oak St', city: 'B', state: 'Ark', zip: '72712' } },
      { birthDate: '2999-01-01' },
      { birthDate: '1899-12-31' },
      { birthDate: '2001-02-29' },
      null,
      'Sam',
    ];
    for (const input of bad) {
      expect(
        await putProfile(doc, table, caller('user_p_bad'), input, clock),
      ).toEqual({ ok: false, code: 'invalid' });
    }
    expect(
      await getProfile(doc, table, caller('user_p_bad'), clock),
    ).toBeNull();
  });
});

// Pure checks of the input parser: these run without DynamoDB Local.
describe('parseProfileFields: names, birth date and address', () => {
  const address = { line1: '12 Oak St', line2: '', city: 'Bentonville', state: 'AR', zip: '72712' };

  it('accepts valid values and null', () => {
    expect(parseProfileFields({ firstName: 'Sam', lastName: 'Smith', birthDate: '1980-05-17', address })).toEqual({
      firstName: 'Sam',
      lastName: 'Smith',
      senderName: 'Sam',
      birthDate: '1980-05-17',
      address,
    });
    expect(parseProfileFields({ firstName: null, lastName: null, birthDate: null, address: null })).toEqual({
      firstName: null,
      lastName: null,
      senderName: null,
      birthDate: null,
      address: null,
    });
  });

  it('trims names, turns blank into null, and cleans the address', () => {
    expect(parseProfileFields({ firstName: ' Sam ', lastName: '  ' })).toEqual({ firstName: 'Sam', lastName: null, senderName: 'Sam' });
    expect(parseProfileFields({ address: { line1: ' 12 Oak St ', city: 'Bentonville', state: 'ar', zip: '72712' } })).toEqual({ address });
    expect(parseProfileFields({ address: { line1: '', line2: '', city: '', state: '', zip: '' } })).toEqual({ address: null });
  });

  it('derives senderName from firstName, and only then', () => {
    expect(parseProfileFields({ firstName: 'Anna', senderName: 'Annie' })).toMatchObject({ senderName: 'Anna' });
    expect(parseProfileFields({ lastName: 'Lee', senderName: 'Annie' })).toEqual({ lastName: 'Lee', senderName: 'Annie' });
  });

  it('splits an old client fullName, and lets an explicit firstName win', () => {
    expect(parseProfileFields({ fullName: 'Anna Lee' })).toEqual({ firstName: 'Anna', lastName: 'Lee' });
    expect(parseProfileFields({ fullName: null })).toEqual({ firstName: null, lastName: null });
    expect(parseProfileFields({ fullName: 'Anna Lee', firstName: 'Ann' })).toMatchObject({ firstName: 'Ann', lastName: 'Lee' });
  });

  it.each([
    { fullName: 'x'.repeat(121) },
    { fullName: 'Sam\u0000' },
    { fullName: 7 },
    { fullName: 'Sam\nSmith' },
    { firstName: 'x'.repeat(101) },
    { firstName: 7 },
    { lastName: 'Sam\tSmith' },
    { address: 'home' },
    { address: { line1: '12 Oak St' } },
    { address: { line1: '12 Oak St', city: 'B', state: 'AR', zip: '1234' } },
    { birthDate: '2999-01-01' },
    { birthDate: '1899-12-31' },
    { birthDate: '2001-02-29' },
    { birthDate: '1980-5-17' },
    { birthDate: 19800517 },
  ])('refuses %j', (input) => {
    expect(parseProfileFields(input)).toBeNull();
  });
});
