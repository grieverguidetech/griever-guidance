import {
  INVITE_TOKEN_PATTERN,
  isUuid,
  isValidInviteEmail,
  normalizeInviteEmail,
} from './members.js';

describe('normalizeInviteEmail', () => {
  it('trims and lower-cases', () => {
    expect(normalizeInviteEmail('  Anna@Example.COM ')).toBe(
      'anna@example.com',
    );
  });
});

describe('isValidInviteEmail', () => {
  it('accepts a normal address', () => {
    expect(isValidInviteEmail('anna@example.com')).toBe(true);
  });

  it.each(['', 'anna', 'anna@', '@example.com', 'a b@example.com', 'a@b@c.com', 'anna@example', 'anna@.com', 'anna@example.'])(
    'rejects %j',
    (value) => {
      expect(isValidInviteEmail(value)).toBe(false);
    },
  );

  it('rejects a tab or newline', () => {
    expect(isValidInviteEmail('anna\t@example.com')).toBe(false);
    expect(isValidInviteEmail('anna@example.com\n')).toBe(false);
  });

  it('allows 254 characters and rejects 255', () => {
    const at = (n: number) => 'a'.repeat(n - '@example.com'.length) + '@example.com';
    expect(isValidInviteEmail(at(254))).toBe(true);
    expect(isValidInviteEmail(at(255))).toBe(false);
  });
});

describe('INVITE_TOKEN_PATTERN', () => {
  it('accepts 43 URL-safe characters', () => {
    expect(INVITE_TOKEN_PATTERN.test('A'.repeat(42) + '-')).toBe(true);
    expect(INVITE_TOKEN_PATTERN.test('a_'.repeat(21) + '9')).toBe(true);
  });

  it.each([
    ['too short', 'A'.repeat(42)],
    ['too long', 'A'.repeat(44)],
    ['padding', 'A'.repeat(42) + '='],
    ['plus', 'A'.repeat(42) + '+'],
    ['space', 'A'.repeat(42) + ' '],
    ['newline suffix', 'A'.repeat(43) + '\n'],
  ])('rejects %s', (_label, value) => {
    expect(INVITE_TOKEN_PATTERN.test(value)).toBe(false);
  });
});

describe('isUuid', () => {
  it('accepts a uuid and rejects other strings', () => {
    expect(isUuid('123e4567-e89b-12d3-a456-426614174000')).toBe(true);
    expect(isUuid('not-a-uuid')).toBe(false);
    expect(isUuid('123e4567-e89b-12d3-a456-426614174000/..')).toBe(false);
  });
});
