import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearJwksCache } from './supabaseJwt.js';
import { createProfileRouter, parseProfileBody } from './profileRouter.js';
import type { Profile } from '@griever/shared';
import type { ProfilesClient } from './supabaseClient.js';
import { SUPABASE_URL, USER_ID, jsonResponse, makeKeys, signJwt } from './testSupabase.js';

const PROFILE: Profile = {
  id: USER_ID,
  senderName: 'Ada',
  contactSource: 'manual',
  createdAt: '2026-10-11T10:00:00.000Z',
  updatedAt: '2026-10-11T10:00:00.000Z',
};

describe('parseProfileBody', () => {
  it('accepts the two allowed fields, including null', () => {
    expect(parseProfileBody({ senderName: 'Ada', contactSource: 'import' })).toEqual({
      fields: { senderName: 'Ada', contactSource: 'import' },
    });
    expect(parseProfileBody({ senderName: null, contactSource: null })).toEqual({
      fields: { senderName: null, contactSource: null },
    });
    expect(parseProfileBody({ senderName: 'x'.repeat(100) })).toHaveProperty('fields');
    // The DB counts characters, not UTF-16 units: 100 emoji fit, 101 do not.
    expect(parseProfileBody({ senderName: '😀'.repeat(100) })).toHaveProperty('fields');
    expect(parseProfileBody({ senderName: '😀'.repeat(101) })).toHaveProperty('error');
  });

  it('uses a fixed message for unknown keys and does not echo the input', () => {
    expect(parseProfileBody({ sneaky: 1 })).toEqual({ error: 'Only your name and contact source can be saved.' });
  });

  it.each([
    ['unknown key', { senderName: 'Ada', email: 'a@b.c' }],
    ['id in body', { id: 'someone-else' }],
    ['name too long', { senderName: 'x'.repeat(101) }],
    ['name not a string', { senderName: 5 }],
    ['bad contactSource', { contactSource: 'facebook' }],
    ['array body', []],
    ['string body', 'hi'],
    ['null body', null],
  ])('rejects %s', (_label, body) => {
    expect(parseProfileBody(body)).toHaveProperty('error');
  });
});

describe('profile router', () => {
  let keys: Awaited<ReturnType<typeof makeKeys>>;
  let token: string;
  const client: ProfilesClient = { get: vi.fn(), upsert: vi.fn() };
  const config = { url: SUPABASE_URL, anonKey: 'anon' };
  const createClient = vi.fn(() => client);
  const router = createProfileRouter({ getConfig: () => config, createClient });

  const call = (method: string, body?: unknown, auth = true) =>
    router.request('/me/profile', {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(auth ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

  beforeEach(async () => {
    clearJwksCache();
    vi.clearAllMocks();
    keys = await makeKeys();
    token = await signJwt(keys.privateKey, keys.kid);
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => jsonResponse(keys.jwks)));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('GET returns the profile and builds the client from the caller token', async () => {
    vi.mocked(client.get).mockResolvedValue(PROFILE);
    const res = await call('GET');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(PROFILE);
    expect(createClient).toHaveBeenCalledWith(config, token);
    expect(client.get).toHaveBeenCalledWith(USER_ID);
  });

  it('GET is 404 when there is no row yet', async () => {
    vi.mocked(client.get).mockResolvedValue(null);
    expect((await call('GET')).status).toBe(404);
  });

  it('GET is 401 without a token', async () => {
    expect((await call('GET', undefined, false)).status).toBe(401);
    expect(client.get).not.toHaveBeenCalled();
  });

  it('GET is 503 when the data store fails', async () => {
    vi.mocked(client.get).mockRejectedValue(new Error('boom'));
    expect((await call('GET')).status).toBe(503);
  });

  it('PUT upserts only the caller row with the validated fields', async () => {
    vi.mocked(client.upsert).mockResolvedValue(PROFILE);
    const res = await call('PUT', { senderName: 'Ada' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(PROFILE);
    expect(client.upsert).toHaveBeenCalledWith(USER_ID, { senderName: 'Ada' });
  });

  it.each([
    ['unknown key', { nope: 1 }],
    ['too-long name', { senderName: 'x'.repeat(101) }],
    ['bad contactSource', { contactSource: 'sms' }],
  ])('PUT 400 for %s and writes nothing', async (_l, body) => {
    const res = await call('PUT', body);
    expect(res.status).toBe(400);
    expect(client.upsert).not.toHaveBeenCalled();
  });

  it('PUT 400 for invalid JSON', async () => {
    const res = await router.request('/me/profile', {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}` },
      body: '{not json',
    });
    expect(res.status).toBe(400);
  });

  it('503 when Supabase is not configured', async () => {
    const unset = createProfileRouter({ getConfig: () => null, createClient });
    const res = await unset.request('/me/profile', { headers: { Authorization: `Bearer ${token}` } });
    expect(res.status).toBe(503);
  });
});
