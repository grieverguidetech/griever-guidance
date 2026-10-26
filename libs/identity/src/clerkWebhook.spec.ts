import { describe, expect, it, vi } from 'vitest';
import { DataFunctionError } from '@griever/gateway-auth';
import { createClerkWebhookRouter } from './clerkWebhook.js';

const KEY = Buffer.from('a-test-signing-key-of-some-length').toString('base64');
const SECRET = `whsec_${KEY}`;
const NOW = 1_800_000_000;
const DATA = { url: 'http://127.0.0.1:3002' };

async function sign(id: string, timestamp: number, body: string, key = KEY): Promise<string> {
  const k = await crypto.subtle.importKey('raw', Buffer.from(key, 'base64'), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
  ]);
  const mac = await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(`${id}.${timestamp}.${body}`));
  return `v1,${Buffer.from(mac).toString('base64')}`;
}

function setup(overrides: { webhookSecret?: string | null } = {}) {
  const deleteUser = vi.fn().mockResolvedValue(undefined);
  const router = createClerkWebhookRouter({
    getWebhookSecret: () => (overrides.webhookSecret === undefined ? SECRET : overrides.webhookSecret),
    getDataConfig: () => DATA,
    getServiceSecret: () => 'service-secret',
    deleteUser,
    now: () => NOW,
  });
  const post = (body: string, headers: Record<string, string>) =>
    router.request('/webhooks/clerk', { method: 'POST', body, headers });
  return { deleteUser, post };
}

const deleted = JSON.stringify({ type: 'user.deleted', data: { id: 'user_123', deleted: true } });

describe('POST /webhooks/clerk', () => {
  it('deletes the user data for a correctly signed user.deleted event', async () => {
    const { post, deleteUser } = setup();
    const res = await post(deleted, {
      'svix-id': 'msg_1',
      'svix-timestamp': String(NOW),
      'svix-signature': await sign('msg_1', NOW, deleted),
    });
    expect(res.status).toBe(204);
    expect(deleteUser).toHaveBeenCalledWith(DATA, 'service-secret', 'user_123');
  });

  it('accepts a header with several signatures when one matches', async () => {
    const { post } = setup();
    const res = await post(deleted, {
      'svix-id': 'msg_1',
      'svix-timestamp': String(NOW),
      'svix-signature': `v1,bm9wZQ== ${await sign('msg_1', NOW, deleted)}`,
    });
    expect(res.status).toBe(204);
  });

  it('answers 401 for a bad signature', async () => {
    const { post, deleteUser } = setup();
    const wrong = await sign('msg_1', NOW, deleted, Buffer.from('another-key').toString('base64'));
    const res = await post(deleted, { 'svix-id': 'msg_1', 'svix-timestamp': String(NOW), 'svix-signature': wrong });
    expect(res.status).toBe(401);
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it('answers 401 when the body was changed after signing', async () => {
    const { post, deleteUser } = setup();
    const res = await post(deleted.replace('user_123', 'user_999'), {
      'svix-id': 'msg_1',
      'svix-timestamp': String(NOW),
      'svix-signature': await sign('msg_1', NOW, deleted),
    });
    expect(res.status).toBe(401);
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it('answers 401 when the headers are missing', async () => {
    const { post, deleteUser } = setup();
    expect((await post(deleted, {})).status).toBe(401);
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it('answers 401 for a stale timestamp, even with a valid signature', async () => {
    const { post, deleteUser } = setup();
    const old = NOW - 301;
    const res = await post(deleted, {
      'svix-id': 'msg_1',
      'svix-timestamp': String(old),
      'svix-signature': await sign('msg_1', old, deleted),
    });
    expect(res.status).toBe(401);
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it('answers 204 and does nothing for other events', async () => {
    const { post, deleteUser } = setup();
    const body = JSON.stringify({ type: 'user.created', data: { id: 'user_123' } });
    const res = await post(body, {
      'svix-id': 'msg_2',
      'svix-timestamp': String(NOW),
      'svix-signature': await sign('msg_2', NOW, body),
    });
    expect(res.status).toBe(204);
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it('answers 502 when the delete fails, so Clerk retries', async () => {
    const { post, deleteUser } = setup();
    deleteUser.mockRejectedValue(new Error('down'));
    const res = await post(deleted, {
      'svix-id': 'msg_1',
      'svix-timestamp': String(NOW),
      'svix-signature': await sign('msg_1', NOW, deleted),
    });
    expect(res.status).toBe(502);
  });

  it('answers 503 when the webhook secret is not set', async () => {
    const { post } = setup({ webhookSecret: null });
    expect((await post(deleted, {})).status).toBe(503);
  });

  it('answers 503 (not 502) when the data function says the delete path is off', async () => {
    const { post, deleteUser } = setup();
    deleteUser.mockRejectedValue(new DataFunctionError(404, 'data function answered 404'));
    const res = await post(deleted, {
      'svix-id': 'msg_1',
      'svix-timestamp': String(NOW),
      'svix-signature': await sign('msg_1', NOW, deleted),
    });
    expect(res.status).toBe(503);
  });

  it('answers 204 for a user.deleted event with no user id (Clerk DeletedObject has optional id)', async () => {
    const { post, deleteUser } = setup();
    const body = JSON.stringify({ type: 'user.deleted', data: { deleted: true, object: 'user' } });
    const res = await post(body, {
      'svix-id': 'msg_3',
      'svix-timestamp': String(NOW),
      'svix-signature': await sign('msg_3', NOW, body),
    });
    expect(res.status).toBe(204);
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it('answers 413 when Content-Length is above 64 KB, before verifying', async () => {
    const { post, deleteUser } = setup();
    const res = await post('x', { 'content-length': String(64 * 1024 + 1) });
    expect(res.status).toBe(413);
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it('answers 413 when a body with no Content-Length streams past 64 KB', async () => {
    const { deleteUser } = setup();
    const router = createClerkWebhookRouter({
      getWebhookSecret: () => SECRET,
      getDataConfig: () => DATA,
      getServiceSecret: () => 'service-secret',
      deleteUser,
      now: () => NOW,
    });
    const chunk = new Uint8Array(1024).fill(97);
    let sent = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (sent >= 100) {
          controller.close();
          return;
        }
        sent += 1;
        controller.enqueue(chunk);
      },
    });
    const res = await router.request(
      new Request('http://x.test/webhooks/clerk', { method: 'POST', body, duplex: 'half' } as RequestInit),
    );
    expect(res.status).toBe(413);
    expect(sent).toBeLessThan(100);
    expect(deleteUser).not.toHaveBeenCalled();
  });
});
