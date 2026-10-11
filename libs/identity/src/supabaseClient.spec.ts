import { afterEach, describe, expect, it, vi } from 'vitest';
import { createProfilesClient } from './supabaseClient.js';
import { SUPABASE_URL, USER_ID, jsonResponse } from './testSupabase.js';

const ROW = {
  id: USER_ID,
  sender_name: 'Ada',
  contact_source: 'import',
  created_at: '2026-10-11T10:00:00.123456+00:00',
  updated_at: '2026-10-11T10:00:00.123456+00:00',
};
const client = () => createProfilesClient({ url: SUPABASE_URL, anonKey: 'anon-key' }, 'caller-jwt');

afterEach(() => vi.unstubAllGlobals());

describe('profiles client', () => {
  it('reads with the anon key and the caller JWT, and maps to camelCase', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse([ROW]));
    vi.stubGlobal('fetch', fetchMock);
    const profile = await client().get(USER_ID);
    expect(profile).toEqual({
      id: USER_ID,
      senderName: 'Ada',
      contactSource: 'import',
      createdAt: '2026-10-11T10:00:00.123Z',
      updatedAt: '2026-10-11T10:00:00.123Z',
    });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${USER_ID}&select=*`);
    expect(init.headers).toMatchObject({ apikey: 'anon-key', Authorization: 'Bearer caller-jwt' });
  });

  it('returns null when no row exists', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse([])));
    expect(await client().get(USER_ID)).toBeNull();
  });

  describe('upsert', () => {
    const res = (body: unknown, status = 200) => jsonResponse(body, status);
    const calls = (m: ReturnType<typeof vi.fn>) =>
      m.mock.calls.map(([url, init]) => `${init?.method ?? 'GET'} ${String(url).replace(SUPABASE_URL, '')}`);

    it('updates an existing row with only the sent columns', async () => {
      const fetchMock = vi.fn().mockResolvedValue(res([ROW]));
      vi.stubGlobal('fetch', fetchMock);
      const out = await client().upsert(USER_ID, { senderName: 'Ada' });
      expect(out.senderName).toBe('Ada');
      expect(calls(fetchMock)).toEqual([`PATCH /rest/v1/profiles?id=eq.${USER_ID}`]);
      const init = fetchMock.mock.calls[0][1];
      expect(init.headers.Prefer).toBe('return=representation');
      expect(JSON.parse(init.body)).toEqual({ sender_name: 'Ada' });
    });

    it('inserts when the update matched no row', async () => {
      const fetchMock = vi.fn().mockResolvedValueOnce(res([])).mockResolvedValueOnce(res([ROW], 201));
      vi.stubGlobal('fetch', fetchMock);
      await client().upsert(USER_ID, { senderName: 'Ada' });
      expect(calls(fetchMock)).toEqual([`PATCH /rest/v1/profiles?id=eq.${USER_ID}`, 'POST /rest/v1/profiles']);
      expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ id: USER_ID, sender_name: 'Ada' });
    });

    it('retries the update once when the insert hits a 409 race', async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(res([]))
        .mockResolvedValueOnce(res({ code: '23505' }, 409))
        .mockResolvedValueOnce(res([ROW]));
      vi.stubGlobal('fetch', fetchMock);
      await client().upsert(USER_ID, { senderName: 'Ada' });
      expect(calls(fetchMock).map((c) => c.split(' ')[0])).toEqual(['PATCH', 'POST', 'PATCH']);
    });

    it('fails if the row is still missing after a 409', async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(res([]))
        .mockResolvedValueOnce(res({}, 409))
        .mockResolvedValueOnce(res([]));
      vi.stubGlobal('fetch', fetchMock);
      await expect(client().upsert(USER_ID, { senderName: 'Ada' })).rejects.toThrow();
    });

    it.each([403, 500])('throws on a %i from PostgREST', async (status) => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(res({}, status)));
      await expect(client().upsert(USER_ID, { senderName: 'Ada' })).rejects.toThrow();
    });

    it('empty body on an existing user: reads, never PATCHes', async () => {
      const fetchMock = vi.fn().mockResolvedValue(res([ROW]));
      vi.stubGlobal('fetch', fetchMock);
      await client().upsert(USER_ID, {});
      expect(calls(fetchMock)).toEqual([`GET /rest/v1/profiles?id=eq.${USER_ID}&select=*`]);
    });

    it('empty body on a new user: inserts with the id only', async () => {
      const fetchMock = vi.fn().mockResolvedValueOnce(res([])).mockResolvedValueOnce(res([ROW], 201));
      vi.stubGlobal('fetch', fetchMock);
      await client().upsert(USER_ID, {});
      expect(calls(fetchMock)).toEqual([`GET /rest/v1/profiles?id=eq.${USER_ID}&select=*`, 'POST /rest/v1/profiles']);
      expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ id: USER_ID });
    });
  });

  it('throws on a non-OK answer', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({}, 403)));
    await expect(client().get(USER_ID)).rejects.toThrow();
  });
});
