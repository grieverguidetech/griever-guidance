import { describe, expect, it, vi } from 'vitest';
import { DATA_SERVICE_DELETE_USER_PATH, DATA_SERVICE_SECRET_HEADER, DATA_USER_TOKEN_HEADER } from '@griever/shared';
import { wiredRules } from '../lambda.js';
import { createDataApp } from './app.js';

const SECRET = 'a-long-service-secret-for-tests-0123456789';

function setup(serviceSecret: string | null = SECRET) {
  const deleteUser = vi.fn().mockResolvedValue(undefined);
  const verify = vi.fn().mockResolvedValue({ userId: 'user_a', email: 'a@example.test', emailVerified: true });
  const app = createDataApp({
    rules: wiredRules,
    doc: {} as never,
    table: 't',
    verify,
    serviceSecret: serviceSecret ?? undefined,
    deleteUser,
    onError: () => undefined,
  });
  const post = (headers: Record<string, string>, body: unknown = { userId: 'user_x' }) =>
    app.request(DATA_SERVICE_DELETE_USER_PATH, { method: 'POST', headers, body: JSON.stringify(body) });
  return { deleteUser, verify, post };
}

describe('data function service path', () => {
  it('deletes with the right secret', async () => {
    const { post, deleteUser } = setup();
    const res = await post({ [DATA_SERVICE_SECRET_HEADER]: SECRET });
    expect(res.status).toBe(200);
    expect(deleteUser).toHaveBeenCalledWith({}, 't', 'user_x', expect.anything());
  });

  it('refuses a missing or wrong secret', async () => {
    const { post, deleteUser } = setup();
    expect((await post({})).status).toBe(401);
    expect((await post({ [DATA_SERVICE_SECRET_HEADER]: 'nope' })).status).toBe(401);
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it('refuses a user token on its own', async () => {
    const { post, deleteUser, verify } = setup();
    const res = await post({ [DATA_USER_TOKEN_HEADER]: 'a-valid-user-token' });
    expect(res.status).toBe(401);
    expect(verify).not.toHaveBeenCalled();
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it('is off (404) when no secret is configured', async () => {
    const { post, deleteUser } = setup(null);
    expect((await post({ [DATA_SERVICE_SECRET_HEADER]: SECRET })).status).toBe(404);
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it('refuses a bad body', async () => {
    const { post, deleteUser } = setup();
    const headers = { [DATA_SERVICE_SECRET_HEADER]: SECRET };
    expect((await post(headers, { userId: 'a#b' })).status).toBe(400);
    expect((await post(headers, { userId: 'user_x', extra: 1 })).status).toBe(400);
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it('is not a user action on /v1', async () => {
    const { deleteUser } = setup();
    const app = createDataApp({ rules: wiredRules, doc: {} as never, table: 't', verify: async () => ({ userId: 'user_a', email: 'a@example.test', emailVerified: true }), serviceSecret: SECRET, deleteUser });
    const res = await app.request('/v1', {
      method: 'POST',
      headers: { [DATA_USER_TOKEN_HEADER]: 't' },
      body: JSON.stringify({ action: 'deleteUser', args: { userId: 'user_x' } }),
    });
    expect(res.status).toBe(400);
    expect(deleteUser).not.toHaveBeenCalled();
  });
});
