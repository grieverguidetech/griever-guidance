import {
  parseInviteEmail,
  INVITE_TOKEN_PATTERN,
  isUserId,
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

  it.each(['', 'anna', 'anna@', '@example.com', 'a b@example.com', 'a@b@c.com', 'a@b.com@c.com', 'a@@example.com', 'a@com.', 'a@.com', 'anna@example', 'anna@.com', 'anna@example.'])(
    'rejects %j',
    (value) => {
      expect(isValidInviteEmail(value)).toBe(false);
    },
  );

  it.each([
    ['display name form', '"anna"<x@evil.com>'],
    ['trailing dot', 'anna@example.com.'],
    ['empty label', 'a@b..com'],
    ['leading hyphen label', 'a@-.com'],
    ['trailing hyphen label', 'a@b-.com'],
    ['semicolon', 'a@b.com;c'],
    ['comma in local part', 'a,b@example.com'],
    ['zero-width space', 'an\u200bna@example.com'],
    ['trailing NUL', 'anna@example.com\u0000'],
    ['non-ASCII domain', 'anna@exämple.com'],
    ['65-character local part', 'a'.repeat(65) + '@example.com'],
    ['64-character label', 'a@' + 'b'.repeat(64) + '.com'],
  ])('rejects %s', (_label, value) => {
    expect(isValidInviteEmail(value)).toBe(false);
  });

  it('accepts a 64-character local part and a hyphen inside a label', () => {
    expect(isValidInviteEmail('a'.repeat(64) + '@example.com')).toBe(true);
    expect(isValidInviteEmail('anna+tag@my-site.example.co.uk')).toBe(true);
  });

  it('rejects a tab or newline', () => {
    expect(isValidInviteEmail('anna\t@example.com')).toBe(false);
    expect(isValidInviteEmail('anna@example.com\n')).toBe(false);
  });

  it('allows 254 characters and rejects 255', () => {
    // 64-character local part, then labels of at most 63 characters.
    const withLength = (total: number) => {
      const domainLength = total - 65;
      const filler = domainLength - '.com'.length - 128;
      return `${'a'.repeat(64)}@${'b'.repeat(63)}.${'b'.repeat(63)}.${'b'.repeat(filler)}.com`;
    };
    expect(withLength(254)).toHaveLength(254);
    expect(isValidInviteEmail(withLength(254))).toBe(true);
    expect(isValidInviteEmail(withLength(255))).toBe(false);
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

describe('parseInviteEmail', () => {
  it('normalises and returns a valid address', () => {
    expect(parseInviteEmail('  Anna@Example.COM ')).toBe('anna@example.com');
  });

  it('returns null for an unusable address', () => {
    expect(parseInviteEmail('anna')).toBeNull();
    expect(parseInviteEmail(' a@b..com ')).toBeNull();
  });
});

describe('isUserId', () => {
  it('accepts Clerk ids and 64 characters', () => {
    expect(isUserId('user_2NNEqL2nrIRdJ194ndJqAHwEfxC')).toBe(true);
    expect(isUserId('u'.repeat(64))).toBe(true);
  });
  it.each(['', 'user#1', 'user 1', 'u'.repeat(65), 'a/b'])('rejects %j', (value) => {
    expect(isUserId(value)).toBe(false);
  });
});
