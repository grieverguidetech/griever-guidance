import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import {
  RATE_LIMITED,
  WRITE_RATE_LIMIT_BINDING,
  writeRateLimit,
  type RateLimitBinding,
} from './writeRateLimit.js';

function makeApp(userId?: string) {
  const app = new Hono<{ Variables: { userId: string } }>();
  app.use('*', async (c, next) => {
    if (userId) {
      c.set('userId', userId);
    }
    return next();
  });
  app.use('*', writeRateLimit());
  app.all('/x', (c) => c.json({ ok: true }));
  return app;
}

const binding = (success: boolean) => {
  const limit = vi.fn(async (_options: { key: string }) => ({ success }));
  return { limit } satisfies RateLimitBinding;
};
const envWith = (b: RateLimitBinding) => ({ [WRITE_RATE_LIMIT_BINDING]: b });

describe('writeRateLimit', () => {
  it('answers 429 with a calm message and Retry-After when limited', async () => {
    const res = await makeApp('u1').request('/x', { method: 'PATCH' }, envWith(binding(false)));
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('60');
    expect(await res.json()).toEqual({ error: RATE_LIMITED });
    expect(RATE_LIMITED).not.toContain('!');
  });

  it('passes through when under the limit', async () => {
    const res = await makeApp('u1').request('/x', { method: 'POST' }, envWith(binding(true)));
    expect(res.status).toBe(200);
  });

  it('passes through when the binding is absent', async () => {
    const res = await makeApp('u1').request('/x', { method: 'POST' });
    expect(res.status).toBe(200);
    const withOther = await makeApp('u1').request('/x', { method: 'POST' }, { OTHER: 1 });
    expect(withOther.status).toBe(200);
  });

  it('does not count or limit reads', async () => {
    const b = binding(false);
    const res = await makeApp('u1').request('/x', { method: 'GET' }, envWith(b));
    expect(res.status).toBe(200);
    expect(b.limit).not.toHaveBeenCalled();
  });

  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])('counts %s', async (method) => {
    const b = binding(true);
    await makeApp('u1').request('/x', { method }, envWith(b));
    expect(b.limit).toHaveBeenCalledTimes(1);
  });

  it('keys by user id, so two users do not share a count', async () => {
    const b = binding(true);
    await makeApp('u1').request('/x', { method: 'POST' }, envWith(b));
    await makeApp('u2').request('/x', { method: 'POST' }, envWith(b));
    expect(b.limit.mock.calls.map(([o]) => o.key)).toEqual(['user:u1', 'user:u2']);
  });

  it('does nothing when there is no user, so there is no shared bucket', async () => {
    const b = binding(false);
    const res = await makeApp().request(
      '/x',
      { method: 'POST', headers: { 'cf-connecting-ip': '203.0.113.9' } },
      envWith(b),
    );
    expect(res.status).toBe(200);
    expect(b.limit).not.toHaveBeenCalled();
  });

  it('lets the request through if the limiter throws', async () => {
    const broken: RateLimitBinding = {
      limit: vi.fn(async () => {
        throw new Error('down');
      }),
    };
    const res = await makeApp('u1').request('/x', { method: 'POST' }, envWith(broken));
    expect(res.status).toBe(200);
  });
});
