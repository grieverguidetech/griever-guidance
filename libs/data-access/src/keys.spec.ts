import {
  flowGuardKey,
  flowKey,
  inviteKey,
  memberKey,
  memberOfKey,
  profileKey,
  refGsi,
  tokenKey,
  userPk,
} from './keys.js';

const UUID = '123e4567-e89b-12d3-a456-426614174000';
const HASH = 'a'.repeat(64);

describe('keys', () => {
  it('builds every key from valid ids', () => {
    expect(profileKey('user_abc-1')).toEqual({ pk: 'USER#user_abc-1', sk: 'PROFILE' });
    expect(flowKey('u1', UUID)).toEqual({ pk: 'USER#u1', sk: `FLOW#${UUID}` });
    expect(flowGuardKey(UUID)).toEqual({ pk: `FLOW#${UUID}`, sk: 'FLOW' });
    expect(memberOfKey('m1')).toEqual({ pk: 'USER#m1', sk: 'MEMBER_OF' });
    expect(memberKey('o1', 'm1')).toEqual({ pk: 'USER#o1', sk: 'MEMBER#m1' });
    expect(inviteKey('o1', UUID)).toEqual({ pk: 'USER#o1', sk: `INVITE#${UUID}` });
    expect(tokenKey(HASH)).toEqual({ pk: `TOKEN#${HASH}`, sk: 'TOKEN' });
    expect(refGsi('u1', 'FLOW', UUID)).toEqual({ gsi1pk: 'REF#u1', gsi1sk: `FLOW#${UUID}` });
    expect(userPk('a'.repeat(64))).toBe(`USER#${'a'.repeat(64)}`);
  });

  it.each([
    ['a hash character', 'u#1'],
    ['a forged sort key', 'u1#FLOW#x'],
    ['empty', ''],
    ['too long', 'a'.repeat(65)],
    ['an email', 'person@example.com'],
    ['a space', 'u 1'],
    ['a newline at the end', 'u1\n'],
  ])('refuses a user id with %s', (_name, bad) => {
    expect(() => userPk(bad)).toThrow();
    expect(() => profileKey(bad)).toThrow();
    expect(() => memberOfKey(bad)).toThrow();
    expect(() => memberKey('o1', bad)).toThrow();
    expect(() => memberKey(bad, 'm1')).toThrow();
    expect(() => refGsi(bad, 'FLOW', UUID)).toThrow();
  });

  it('refuses a flow or invite id that is not a UUID', () => {
    for (const bad of ['', 'not-a-uuid', `${UUID}#x`, 'a@b.co']) {
      expect(() => flowKey('u1', bad)).toThrow();
      expect(() => flowGuardKey(bad)).toThrow();
      expect(() => inviteKey('u1', bad)).toThrow();
    }
  });

  it('gives upper and lower case ids the same key', () => {
    const upper = UUID.toUpperCase();
    expect(flowKey('u1', upper)).toEqual(flowKey('u1', UUID));
    expect(flowGuardKey(upper)).toEqual(flowGuardKey(UUID));
    expect(inviteKey('u1', upper)).toEqual(inviteKey('u1', UUID));
    expect(refGsi('u1', 'INVITE', upper)).toEqual(refGsi('u1', 'INVITE', UUID));
  });

  it('refuses a gsi reference with a bad item id', () => {
    expect(() => refGsi('u1', 'FLOW', 'x#y')).toThrow();
  });

  it('refuses a token hash that is not 64 lowercase hex characters', () => {
    for (const bad of ['', 'a'.repeat(63), 'a'.repeat(65), 'A'.repeat(64), `${'a'.repeat(63)}#`, 'a@b.co']) {
      expect(() => tokenKey(bad)).toThrow();
    }
  });

  it('never puts an email in a key', () => {
    expect(() => profileKey('person@example.com')).toThrow();
    expect(() => memberKey('o1', 'person@example.com')).toThrow();
  });
});
