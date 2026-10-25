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
import { getProfile, putProfile } from './profiles.js';

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
