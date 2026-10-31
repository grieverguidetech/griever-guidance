import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Jwt } from 'hono/utils/jwt';
import { clearClerkCache, DataFunctionError } from '@griever/gateway-auth';
import { createProfileRouter, parseProfileBody } from './profileRouter.js';

const ISSUER = 'https://clerk.example.test';
const USER_ID = 'user_abc123';
const DATA = { url: 'http://127.0.0.1:3002', region: 'us-east-2' };
const STORED = {
  userId: USER_ID,
  senderName: 'Ada',
  contactSource: 'manual',
  fullName: 'Ada King',
  birthDate: '1980-12-10',
  accountType: 'owner',
  version: 3,
  createdAt: '2026-10-11T10:00:00.000Z',
  updatedAt: '2026-10-11T10:00:00.000Z',
};
const PROFILE = {
  id: USER_ID,
  senderName: 'Ada',
  contactSource: 'manual',
  fullName: 'Ada King',
  birthDate: '1980-12-10',
  accountType: 'owner',
  createdAt: '2026-10-11T10:00:00.000Z',
  updatedAt: '2026-10-11T10:00:00.000Z',
};

async function makeKey() {
  const pair = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  );
  return {
    privateJwk: { ...(await crypto.subtle.exportKey('jwk', pair.privateKey)), kid: 'k1', alg: 'RS256' },
    publicJwk: { ...(await crypto.subtle.exportKey('jwk', pair.publicKey)), kid: 'k1', alg: 'RS256' },
  };
}

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

  it('accepts fullName and birthDate, including null', () => {
    expect(parseProfileBody({ fullName: 'Ada King', birthDate: '1980-05-17' })).toEqual({
      fields: { fullName: 'Ada King', birthDate: '1980-05-17' },
    });
    expect(parseProfileBody({ fullName: null, birthDate: null })).toEqual({
      fields: { fullName: null, birthDate: null },
    });
    expect(parseProfileBody({ fullName: '😀'.repeat(120) })).toHaveProperty('fields');
  });

  it('trims fullName and turns blank into null', () => {
    expect(parseProfileBody({ fullName: '  Ada King ' })).toEqual({ fields: { fullName: 'Ada King' } });
    expect(parseProfileBody({ fullName: '   ' })).toEqual({ fields: { fullName: null } });
  });

  it('uses a fixed message for unknown keys and does not echo the input', () => {
    expect(parseProfileBody({ sneaky: 1 })).toEqual({ error: 'Only your name, full name, date of birth and contact source can be saved.' });
  });

  it.each([
    ['unknown key', { senderName: 'Ada', email: 'a@b.c' }],
    ['id in body', { id: 'someone-else' }],
    ['name too long', { senderName: 'x'.repeat(101) }],
    ['name not a string', { senderName: 5 }],
    ['bad contactSource', { contactSource: 'facebook' }],
    ['fullName too long', { fullName: 'x'.repeat(121) }],
    ['fullName with a control character', { fullName: 'Ada\u0000' }],
    ['fullName not a string', { fullName: 5 }],
    ['fullName with a line break', { fullName: 'Ada\nKing' }],
    ['fullName with a tab', { fullName: 'Ada\tKing' }],
    ['birthDate in the future', { birthDate: '2999-01-01' }],
    ['birthDate before 1900', { birthDate: '1899-12-31' }],
    ['birthDate not a real day', { birthDate: '2001-02-29' }],
    ['birthDate wrong format', { birthDate: '05/17/1980' }],
    ['birthDate not a string', { birthDate: 19800517 }],
    ['array body', []],
    ['string body', 'hi'],
    ['null body', null],
  ])('rejects %s', (_label, body) => {
    expect(parseProfileBody(body)).toHaveProperty('error');
  });
});

describe('profile router', () => {
  let token: string;
  const callData = vi.fn();
  let dataConfig: typeof DATA | null = DATA;
  const router = createProfileRouter({
    getAuthConfig: () => ({ issuer: ISSUER, authorizedParties: [] }),
    getDataConfig: () => dataConfig,
    callData: callData as never,
  });

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
    vi.clearAllMocks();
    clearClerkCache();
    dataConfig = DATA;
    const key = await makeKey();
    token = await Jwt.sign(
      { sub: USER_ID, iss: ISSUER, exp: Math.floor(Date.now() / 1000) + 300, email: 'ada@example.test' },
      key.privateJwk,
      'RS256',
    );
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => new Response(JSON.stringify({ keys: [key.publicJwk] }))));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('GET reads through the data function with the caller token and returns the shared shape', async () => {
    callData.mockResolvedValue({ ok: true, data: STORED });
    const res = await call('GET');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(PROFILE);
    expect(callData).toHaveBeenCalledWith(DATA, token, 'getProfile', {});
  });

  it('GET maps missing optional fields to null and passes a member through', async () => {
    callData.mockResolvedValue({
      ok: true,
      data: { userId: USER_ID, accountType: 'member', version: 1, createdAt: 'a', updatedAt: 'b' },
    });
    expect(await (await call('GET')).json()).toEqual({
      id: USER_ID,
      senderName: null,
      contactSource: null,
      fullName: null,
      birthDate: null,
      accountType: 'member',
      createdAt: 'a',
      updatedAt: 'b',
    });
  });

  it('GET is 404 when there is no profile yet', async () => {
    callData.mockResolvedValue({ ok: true, data: null });
    expect((await call('GET')).status).toBe(404);
  });

  it('GET maps not_found to 404', async () => {
    callData.mockResolvedValue({ ok: false, code: 'not_found' });
    expect((await call('GET')).status).toBe(404);
  });

  it('PUT is 503 when the data function returns ok with no profile', async () => {
    callData.mockResolvedValue({ ok: true, data: null });
    expect((await call('PUT', { senderName: 'Ada' })).status).toBe(503);
  });

  it('GET is 401 without a token and never calls the data function', async () => {
    expect((await call('GET', undefined, false)).status).toBe(401);
    expect(callData).not.toHaveBeenCalled();
  });

  it('GET is 401 when the data function says unauthorized', async () => {
    callData.mockResolvedValue({ ok: false, code: 'unauthorized' });
    const res = await call('GET');
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Please sign in again.' });
  });

  it('GET is 503 with calm copy when the data function is busy, ignoring its message', async () => {
    callData.mockResolvedValue({ ok: false, code: 'busy', message: 'internal detail' });
    const res = await call('GET');
    expect(res.status).toBe(503);
    const text = JSON.stringify(await res.json());
    expect(text).toContain('Please try again in a moment.');
    expect(text).not.toContain('internal detail');
  });

  it('GET is 503 when the data function call throws', async () => {
    callData.mockRejectedValue(new DataFunctionError(500, 'data function answered 500'));
    expect((await call('GET')).status).toBe(503);
  });

  it('GET is 503 when the data function URL is unset', async () => {
    dataConfig = null;
    expect((await call('GET')).status).toBe(503);
    expect(callData).not.toHaveBeenCalled();
  });

  it('PUT sends only the validated fields and returns the shared shape', async () => {
    callData.mockResolvedValue({ ok: true, data: STORED });
    const res = await call('PUT', { senderName: 'Ada' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(PROFILE);
    expect(callData).toHaveBeenCalledWith(DATA, token, 'putProfile', { fields: { senderName: 'Ada' } });
  });

  it('PUT sends fullName and birthDate to the data function', async () => {
    callData.mockResolvedValue({ ok: true, data: STORED });
    const res = await call('PUT', { fullName: 'Ada King', birthDate: '1980-12-10' });
    expect(res.status).toBe(200);
    expect(callData).toHaveBeenCalledWith(DATA, token, 'putProfile', {
      fields: { fullName: 'Ada King', birthDate: '1980-12-10' },
    });
  });

  it('PUT maps invalid from the data function to 400', async () => {
    callData.mockResolvedValue({ ok: false, code: 'invalid' });
    expect((await call('PUT', { senderName: 'Ada' })).status).toBe(400);
  });

  it.each([
    ['unknown key', { nope: 1 }],
    ['too-long name', { senderName: 'x'.repeat(101) }],
    ['future birthDate', { birthDate: '2999-01-01' }],
    ['control character in fullName', { fullName: 'A\u0001' }],
    ['bad contactSource', { contactSource: 'sms' }],
    ['accountType (read-only)', { senderName: 'Ada', accountType: 'member' }],
    ['account_type (read-only)', { account_type: 'member' }],
  ])('PUT 400 for %s and writes nothing', async (_l, body) => {
    const res = await call('PUT', body);
    expect(res.status).toBe(400);
    expect(callData).not.toHaveBeenCalled();
  });

  it('PUT 400 for invalid JSON', async () => {
    const res = await router.request('/me/profile', {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}` },
      body: '{not json',
    });
    expect(res.status).toBe(400);
  });

  it('503 when CLERK_ISSUER is not configured', async () => {
    const unset = createProfileRouter({ getAuthConfig: () => null, getDataConfig: () => DATA, callData: callData as never });
    const res = await unset.request('/me/profile', { headers: { Authorization: `Bearer ${token}` } });
    expect(res.status).toBe(503);
  });
});
