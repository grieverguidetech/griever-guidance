import { describe, expect, it } from 'vitest';
import { signToken, verifyToken } from './token.js';

describe('signToken / verifyToken', () => {
  it('round-trips a payload', async () => {
    const token = await signToken({ userId: 'usr_1' }, 'secret', 60);
    const payload = await verifyToken<{ userId: string; exp: number }>(token, 'secret');
    expect(payload?.userId).toBe('usr_1');
  });

  it('rejects a token signed with a different secret', async () => {
    const token = await signToken({ userId: 'usr_1' }, 'secret', 60);
    expect(await verifyToken(token, 'other-secret')).toBeNull();
  });

  it('rejects a tampered body', async () => {
    const token = await signToken({ userId: 'usr_1' }, 'secret', 60);
    const [, signature] = token.split('.');
    const forged = await signToken({ userId: 'usr_evil' }, 'wrong', 60);
    const [forgedBody] = forged.split('.');
    expect(await verifyToken(`${forgedBody}.${signature}`, 'secret')).toBeNull();
  });

  it('rejects an expired token', async () => {
    const token = await signToken({ userId: 'usr_1' }, 'secret', -1);
    expect(await verifyToken(token, 'secret')).toBeNull();
  });

  it('rejects a malformed token', async () => {
    expect(await verifyToken('not-a-token', 'secret')).toBeNull();
    expect(await verifyToken('', 'secret')).toBeNull();
  });
});
