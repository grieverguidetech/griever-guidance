import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from './password.js';

describe('hashPassword / verifyPassword', () => {
  it('verifies the correct password against its own hash', async () => {
    const { hash, salt } = await hashPassword('correct horse battery staple');
    expect(await verifyPassword('correct horse battery staple', hash, salt)).toBe(true);
  });

  it('rejects the wrong password', async () => {
    const { hash, salt } = await hashPassword('correct horse battery staple');
    expect(await verifyPassword('wrong password', hash, salt)).toBe(false);
  });

  it('produces a different hash/salt each time, even for the same password', async () => {
    const a = await hashPassword('same password');
    const b = await hashPassword('same password');
    expect(a.salt).not.toBe(b.salt);
    expect(a.hash).not.toBe(b.hash);
  });

  it('rejects when checked against a different salt', async () => {
    const a = await hashPassword('a password');
    const b = await hashPassword('a password');
    expect(await verifyPassword('a password', a.hash, b.salt)).toBe(false);
  });
});
