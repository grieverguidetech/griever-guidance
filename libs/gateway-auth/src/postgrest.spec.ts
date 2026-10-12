import { afterEach, describe, expect, it, vi } from 'vitest';
import { PostgrestError, postgrestHeaders, postgrestRequest, rpc } from './postgrest.js';
import { SUPABASE_URL, jsonResponse } from './testSupabase.js';

const config = { url: SUPABASE_URL, anonKey: 'anon-key' };

afterEach(() => vi.unstubAllGlobals());

function stubFetch(res: Response) {
  const fetchMock = vi.fn().mockResolvedValue(res);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('postgrest helper', () => {
  it('sends the anon key and the caller JWT, never anything else', () => {
    expect(postgrestHeaders(config, 'caller-jwt')).toEqual({
      apikey: 'anon-key',
      Authorization: 'Bearer caller-jwt',
      'Content-Type': 'application/json',
    });
  });

  it('rpc posts a JSON body to /rest/v1/rpc/<name> and returns the parsed result', async () => {
    const fetchMock = stubFetch(jsonResponse({ ok: true }));
    await expect(rpc(config, 'caller-jwt', 'accept_invite', { token: 't' })).resolves.toEqual({ ok: true });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${SUPABASE_URL}/rest/v1/rpc/accept_invite`);
    expect(init.method).toBe('POST');
    expect(init.body).toBe(JSON.stringify({ token: 't' }));
    expect(init.headers.apikey).toBe('anon-key');
    expect(init.headers.Authorization).toBe('Bearer caller-jwt');
  });

  it('rpc returns null for an empty body', async () => {
    stubFetch(new Response(null, { status: 204 }));
    await expect(rpc(config, 'jwt', 'noop')).resolves.toBeNull();
  });

  it('table requests default to GET and pass the path through', async () => {
    const fetchMock = stubFetch(jsonResponse([]));
    await postgrestRequest(config, 'jwt', 'members?select=*');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${SUPABASE_URL}/rest/v1/members?select=*`);
    expect(init.method).toBe('GET');
    expect(init.body).toBeUndefined();
  });

  it('throws an error carrying the status and the PostgREST code on non-2xx', async () => {
    stubFetch(jsonResponse({ code: '42501', message: 'denied' }, 403));
    const err = await rpc(config, 'jwt', 'secret').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PostgrestError);
    expect(err).toMatchObject({ status: 403, code: '42501' });
  });

  it('still throws with the status when the error body is not JSON', async () => {
    stubFetch(new Response('boom', { status: 502 }));
    const err = await rpc(config, 'jwt', 'x').catch((e: unknown) => e);
    expect(err).toMatchObject({ status: 502, code: null });
  });
});
