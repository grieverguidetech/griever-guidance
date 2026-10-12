import { describe, expect, it } from 'vitest';
import { INVITE_TOKEN_PATTERN } from '@griever/shared';
import { hashInviteToken, newInviteToken } from './inviteToken.js';

describe('newInviteToken', () => {
  it('is 43 base64url characters matching the shared pattern', () => {
    const token = newInviteToken();
    expect(token).toHaveLength(43);
    expect(INVITE_TOKEN_PATTERN.test(token)).toBe(true);
  });

  it('is different every time', () => {
    const tokens = new Set(Array.from({ length: 1000 }, newInviteToken));
    expect(tokens.size).toBe(1000);
  });
});

describe('hashInviteToken', () => {
  it('is the SHA-256 hex of the token', async () => {
    expect(await hashInviteToken('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('is 64 lowercase hex characters and never the token itself', async () => {
    const token = newInviteToken();
    const hash = await hashInviteToken(token);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain(token);
  });
});
