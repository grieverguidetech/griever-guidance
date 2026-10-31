import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Jwt } from 'hono/utils/jwt';
import { clearClerkCache } from '@griever/gateway-auth';
import { FORBIDDEN_SYNC_KEYS, FLOW_DETAIL_MAX_LENGTH } from '@griever/shared';
import { FLOWS_CANNOT_ADD, FLOWS_TOO_LARGE, MAX_BODY_BYTES, createFlowsRouter, flowsFailureFor } from './flowsRouter.js';

const ISSUER = 'https://clerk.example.test';
const DATA = { url: 'http://127.0.0.1:3002' };
const FLOW_ID = '33333333-3333-4333-8333-333333333333';
const FACTS = {
  personName: 'Margaret Hayes',
  dateOfPassing: 'May 29, 2026',
  serviceDate: null,
  obituaryUrl: null,
  obituaryPublisher: null,
  serviceReady: false,
};
const RECORD = {
  id: FLOW_ID,
  ownerId: '44444444-4444-4444-8444-444444444444',
  role: 'owner',
  facts: FACTS,
  updatedAt: '2026-10-30T10:00:00.000Z',
  updatedBy: null,
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

describe('flows router (real callData, fetch stubbed)', () => {
  let token: string;
  let dataConfigured = true;
  let dataAnswer: () => Response;
  let dataCalls: { headers: Record<string, string>; body: { action: string; args: Record<string, unknown> } }[];

  const router = createFlowsRouter({
    getAuthConfig: () => ({ issuer: ISSUER, authorizedParties: [] }),
    getDataConfig: () => (dataConfigured ? DATA : null),
  });

  const ok = (data: unknown) => new Response(JSON.stringify({ ok: true, data }));
  const fail = (code: string) => new Response(JSON.stringify({ ok: false, code }));

  const send = (method: string, path: string, body?: unknown, auth = true) =>
    router.request(path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
    });

  beforeEach(async () => {
    clearClerkCache();
    dataConfigured = true;
    dataCalls = [];
    dataAnswer = () => ok(RECORD);
    const key = await makeKey();
    token = await Jwt.sign(
      { sub: 'user_owner123', iss: ISSUER, exp: Math.floor(Date.now() / 1000) + 300, email: 'ada@example.test' },
      key.privateJwk,
      'RS256',
    );
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith('/v1')) {
          dataCalls.push({
            headers: init?.headers as Record<string, string>,
            body: JSON.parse(String(init?.body)),
          });
          return dataAnswer();
        }
        return new Response(JSON.stringify({ keys: [key.publicJwk] }));
      }),
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  describe('auth', () => {
    it.each([
      ['GET', '/flows', undefined],
      ['POST', '/flows', { id: FLOW_ID, ...FACTS }],
      ['PATCH', `/flows/${FLOW_ID}`, { personName: 'A' }],
    ])('%s %s is 401 without a token', async (method, path, body) => {
      const res = await send(method, path, body, false);
      expect(res.status).toBe(401);
      expect(dataCalls).toHaveLength(0);
    });

    it('is 503 when the data function is not configured', async () => {
      dataConfigured = false;
      expect((await send('GET', '/flows')).status).toBe(503);
    });
  });

  describe('GET /flows', () => {
    it('returns the list, calling listFlows as the caller', async () => {
      dataAnswer = () => ok([RECORD]);
      const res = await send('GET', '/flows');
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual([RECORD]);
      expect(dataCalls[0]!.body).toEqual({ action: 'listFlows', args: {} });
      expect(dataCalls[0]!.headers['x-gg-user-token']).toBe(token);
    });
  });

  describe('POST /flows', () => {
    it('creates with facts and detail keys, id kept separate', async () => {
      const res = await send('POST', '/flows', {
        id: FLOW_ID,
        ...FACTS,
        serviceType: 'Funeral',
        burialPrivate: true,
        serviceStatus: 'ready',
        obituaryText: null,
      });
      expect(res.status).toBe(201);
      expect(await res.json()).toEqual(RECORD);
      expect(dataCalls).toHaveLength(1);
      expect(dataCalls[0]!.body).toEqual({
        action: 'createFlow',
        args: {
          id: FLOW_ID,
          facts: { ...FACTS, serviceType: 'Funeral', burialPrivate: true, serviceStatus: 'ready', obituaryText: null },
        },
      });
    });

    it.each([
      ['a missing fact', { id: FLOW_ID, personName: 'A' }],
      ['a missing id', { ...FACTS }],
      ['a bad id', { id: 'nope', ...FACTS }],
      ['an unknown key', { id: FLOW_ID, ...FACTS, nickname: 'x' }],
      ['a text detail that is too long', { id: FLOW_ID, ...FACTS, serviceNotes: 'x'.repeat(FLOW_DETAIL_MAX_LENGTH.serviceNotes + 1) }],
      ['a bad status', { id: FLOW_ID, ...FACTS, serviceStatus: 'done' }],
      ['a control character', { id: FLOW_ID, ...FACTS, servicePlace: 'a\u0000b' }],
      ['an array', [FACTS]],
    ])('is 400 for %s and makes no data call', async (_name, body) => {
      const res = await send('POST', '/flows', body);
      expect(res.status).toBe(400);
      expect(dataCalls).toHaveLength(0);
    });

    it('is 400 for a body that is not JSON', async () => {
      expect((await send('POST', '/flows', '{nope')).status).toBe(400);
      expect(dataCalls).toHaveLength(0);
    });
  });

  describe('PATCH /flows/:id', () => {
    it('sends a partial patch of facts and details together', async () => {
      const res = await send('PATCH', `/flows/${FLOW_ID}`, { serviceReady: true, thanksMessage: '', personStatus: null });
      expect(res.status).toBe(200);
      expect(dataCalls[0]!.body).toEqual({
        action: 'updateFlow',
        args: { id: FLOW_ID, patch: { serviceReady: true, thanksMessage: '', personStatus: null } },
      });
    });

    it('is 400 for a bad id', async () => {
      expect((await send('PATCH', '/flows/not-a-uuid', { personName: 'A' })).status).toBe(400);
      expect(dataCalls).toHaveLength(0);
    });

    it('is 400 for an over-length fact', async () => {
      expect((await send('PATCH', `/flows/${FLOW_ID}`, { personName: 'x'.repeat(201) })).status).toBe(400);
      expect(dataCalls).toHaveLength(0);
    });

    it('is 400 for an empty patch and makes no data call', async () => {
      expect((await send('PATCH', `/flows/${FLOW_ID}`, {})).status).toBe(400);
      expect(dataCalls).toHaveLength(0);
    });

    // Known gap: fact text is not checked for control characters in the shared parser (#529).
    it.fails('is 400 for a control character in a fact (#529)', async () => {
      expect((await send('PATCH', `/flows/${FLOW_ID}`, { personName: 'a\u0001b' })).status).toBe(400);
    });

    it('is 400 for an unknown key', async () => {
      expect((await send('PATCH', `/flows/${FLOW_ID}`, { nickname: 'x' })).status).toBe(400);
      expect(dataCalls).toHaveLength(0);
    });

    it('is 400 for an own __proto__ key', async () => {
      expect((await send('PATCH', `/flows/${FLOW_ID}`, '{"__proto__":{"personName":"A"}}')).status).toBe(400);
      expect(dataCalls).toHaveLength(0);
    });
  });

  describe('forbidden keys (C2, C3, C8)', () => {
    it.each(FORBIDDEN_SYNC_KEYS.map((key) => [key]))('%s is 400 on PATCH and POST with no data call', async (key) => {
      const patch = await send('PATCH', `/flows/${FLOW_ID}`, { personName: 'A', [key]: 'x' });
      expect(patch.status).toBe(400);
      const create = await send('POST', '/flows', { id: FLOW_ID, ...FACTS, [key]: 'x' });
      expect(create.status).toBe(400);
      expect(dataCalls).toHaveLength(0);
    });
  });

  describe('body size', () => {
    it('is 413 above 128 KB on POST and PATCH, with no data call', async () => {
      const big = JSON.stringify({ personName: 'x'.repeat(MAX_BODY_BYTES) });
      const post = await send('POST', '/flows', big);
      expect(post.status).toBe(413);
      expect(await post.json()).toEqual({ error: FLOWS_TOO_LARGE });
      expect((await send('PATCH', `/flows/${FLOW_ID}`, big)).status).toBe(413);
      expect(dataCalls).toHaveLength(0);
    });

    it('is 413 when Content-Length is over the cap, with no data call', async () => {
      const res = await router.request(`/flows/${FLOW_ID}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'Content-Length': String(MAX_BODY_BYTES + 1),
        },
        body: JSON.stringify({ personName: 'A' }),
      });
      expect(res.status).toBe(413);
      expect(dataCalls).toHaveLength(0);
    });

    it('accepts the longest honest body (10,000-character obituary text)', async () => {
      const res = await send('PATCH', `/flows/${FLOW_ID}`, { obituaryText: 'x'.repeat(10000) });
      expect(res.status).toBe(200);
    });
  });

  describe('error mapping', () => {
    it.each([
      ['invalid', 400],
      ['unauthorized', 401],
      ['forbidden', 403],
      ['not_found', 404],
      ['conflict', 409],
      ['busy', 503],
      ['something_new', 503],
    ])('data code %s becomes %i', async (code, status) => {
      dataAnswer = () => fail(code);
      expect((await send('PATCH', `/flows/${FLOW_ID}`, { personName: 'A' })).status).toBe(status);
      expect(flowsFailureFor(code).status).toBe(status);
    });

    it('a member creating gets the calm 403 copy about adding', async () => {
      dataAnswer = () => fail('forbidden');
      const res = await send('POST', '/flows', { id: FLOW_ID, ...FACTS });
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ error: FLOWS_CANNOT_ADD });
    });

    it('is 409 when the id already exists', async () => {
      dataAnswer = () => fail('conflict');
      expect((await send('POST', '/flows', { id: FLOW_ID, ...FACTS })).status).toBe(409);
    });

    it('is 503 when the data function is down, without leaking details', async () => {
      dataAnswer = () => new Response('boom', { status: 500 });
      const res = await send('GET', '/flows');
      expect(res.status).toBe(503);
      expect(JSON.stringify(await res.json())).not.toContain('boom');
    });
  });
});
