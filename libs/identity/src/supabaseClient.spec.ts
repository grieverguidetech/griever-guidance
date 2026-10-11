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

  it('upserts only the sent columns and asks for the row back', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse([ROW], 201));
    vi.stubGlobal('fetch', fetchMock);
    await client().upsert(USER_ID, { senderName: 'Ada' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${SUPABASE_URL}/rest/v1/profiles?on_conflict=id`);
    expect(init.method).toBe('POST');
    expect(init.headers.Prefer).toBe('resolution=merge-duplicates,return=representation');
    expect(JSON.parse(init.body)).toEqual({ id: USER_ID, sender_name: 'Ada' });
  });

  it('throws on a non-OK answer', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({}, 403)));
    await expect(client().get(USER_ID)).rejects.toThrow();
  });
});
