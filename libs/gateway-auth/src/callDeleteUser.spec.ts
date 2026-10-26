import { afterEach, describe, expect, it, vi } from 'vitest';
import { callDeleteUser, DataFunctionError } from './dataFunction.js';

afterEach(() => vi.unstubAllGlobals());

describe('callDeleteUser', () => {
  it('posts the user id with the service secret and no user token', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{"ok":true,"data":null}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await callDeleteUser({ url: 'http://127.0.0.1:3002' }, 'shh', 'user_x');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://127.0.0.1:3002/internal/delete-user');
    const headers = init.headers as Record<string, string>;
    expect(headers['x-gg-service-secret']).toBe('shh');
    expect(headers['x-gg-user-token']).toBeUndefined();
    expect(JSON.parse(init.body as string)).toEqual({ userId: 'user_x' });
  });

  it('signs the call for a non-loopback url', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await callDeleteUser(
      { url: 'https://fn.lambda-url.us-east-2.on.aws', region: 'us-east-2', accessKeyId: 'AKIA', secretAccessKey: 's' },
      'shh',
      'user_x',
    );
    const request = fetchMock.mock.calls[0]?.[0] as Request;
    expect(request.headers.get('authorization')).toMatch(/^AWS4-HMAC-SHA256/);
  });

  it('throws on a non-200 answer', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 401 })));
    await expect(callDeleteUser({ url: 'http://127.0.0.1:3002' }, 'bad', 'user_x')).rejects.toBeInstanceOf(
      DataFunctionError,
    );
  });
});
