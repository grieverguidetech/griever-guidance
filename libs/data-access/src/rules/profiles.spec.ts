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

  it('stores and returns fullName and birthDate, and clears them with null', async () => {
    const id = caller('user_p_private');
    await putProfile(doc, table, id, { fullName: 'Sam Smith', birthDate: '1980-05-17' }, clock);
    expect(await getProfile(doc, table, id, clock)).toMatchObject({
      fullName: 'Sam Smith',
      birthDate: '1980-05-17',
    });
    await putProfile(doc, table, id, { fullName: null, birthDate: null }, clock);
    const cleared = await getProfile(doc, table, id, clock);
    expect(cleared).not.toHaveProperty('fullName');
    expect(cleared).not.toHaveProperty('birthDate');
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
describe('parseProfileFields: fullName and birthDate', () => {
  it('accepts valid values and null', () => {
    expect(parseProfileFields({ fullName: 'Sam Smith', birthDate: '1980-05-17' })).toEqual({
      fullName: 'Sam Smith',
      birthDate: '1980-05-17',
    });
    expect(parseProfileFields({ fullName: null, birthDate: null })).toEqual({ fullName: null, birthDate: null });
  });

  it('trims fullName and turns blank into null', () => {
    expect(parseProfileFields({ fullName: ' Sam ' })).toEqual({ fullName: 'Sam' });
    expect(parseProfileFields({ fullName: '  ' })).toEqual({ fullName: null });
  });

  it.each([
    { fullName: 'x'.repeat(121) },
    { fullName: 'Sam\u0000' },
    { fullName: 7 },
    { fullName: 'Sam\nSmith' },
    { fullName: 'Sam\tSmith' },
    { birthDate: '2999-01-01' },
    { birthDate: '1899-12-31' },
    { birthDate: '2001-02-29' },
    { birthDate: '1980-5-17' },
    { birthDate: 19800517 },
  ])('refuses %j', (input) => {
    expect(parseProfileFields(input)).toBeNull();
  });
});
