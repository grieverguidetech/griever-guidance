import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Jwt } from 'hono/utils/jwt';
import { clearClerkCache, DataFunctionError } from '@griever/gateway-auth';
import { hashInviteToken } from './inviteToken.js';
import {
  BAD_BODY,
  BAD_EMAIL,
  BAD_ID,
  SEND_FAILED,
  UNAVAILABLE,
  UNUSABLE,
  createMembersRouter,
  failureFor,
} from './membersRouter.js';

const ISSUER = 'https://clerk.example.test';
const DATA = { url: 'http://127.0.0.1:3002', region: 'us-east-2' };
const MAIL = { apiKey: 're_test_key', from: 'hello@example.test', webUrl: 'https://app.example.test' };
const INVITE_ID = '22222222-2222-4222-8222-222222222222';
const MEMBER_ID = 'user_member123';
const OWNER_ID = 'user_owner123';
const TOKEN = 'A'.repeat(43);
const INVITE = {
  id: INVITE_ID,
  email: 'sam@example.test',
  expiresAt: '2026-10-19T10:00:00.000Z',
  createdAt: '2026-10-12T10:00:00.000Z',
};
const OWNER_VIEW = { role: 'owner', members: [], invites: [INVITE] };

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

describe('members router', () => {
  let token: string;
  let mail = { ...MAIL } as { apiKey?: string; from?: string; webUrl?: string };
  let dataConfig: typeof DATA | null = DATA;
  let emailCalls: string[];
  let emailStatus: number;
  const callData = vi.fn();

  const router = createMembersRouter({
    getAuthConfig: () => ({ issuer: ISSUER, authorizedParties: [] }),
    getDataConfig: () => dataConfig,
    getMail: () => mail,
    callData: callData as never,
  });

  /** Default answers per action; a test overrides one. */
  const answer = (overrides: Record<string, unknown> = {}) => {
    const defaults: Record<string, unknown> = {
      createInvite: { ok: true, data: INVITE },
      revokeInvite: { ok: true, data: null },
      listMembers: { ok: true, data: OWNER_VIEW },
      removeMember: { ok: true, data: null },
      acceptInvite: { ok: true, data: { ownerId: OWNER_ID } },
      getProfile: { ok: true, data: { userId: OWNER_ID, senderName: 'Ada', accountType: 'owner' } },
      ...overrides,
    };
    callData.mockImplementation(async (_cfg, _tok, action: string) => {
      const value = defaults[action];
      if (value instanceof Error) {
        throw value;
      }
      return value;
    });
  };
  const sent = (action: string) => callData.mock.calls.filter((c) => c[2] === action);

  const send = (method: string, path: string, body?: unknown, auth = true) =>
    router.request(path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
    });

  beforeEach(async () => {
    vi.clearAllMocks();
    clearClerkCache();
    dataConfig = DATA;
    mail = { ...MAIL };
    emailCalls = [];
    emailStatus = 200;
    answer();
    const key = await makeKey();
    token = await Jwt.sign(
      { sub: OWNER_ID, iss: ISSUER, exp: Math.floor(Date.now() / 1000) + 300, email: 'ada@example.test' },
      key.privateJwk,
      'RS256',
    );
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith('emails')) {
          emailCalls.push(String(init?.body ?? ''));
          return new Response(JSON.stringify({ id: 'e1' }), { status: emailStatus });
        }
        return new Response(JSON.stringify({ keys: [key.publicJwk] }));
      }),
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  describe('auth', () => {
    it.each([
      ['GET', '/members', undefined],
      ['POST', '/invites', { email: 'a@b.co' }],
      ['POST', '/invites/accept', { token: TOKEN }],
      ['DELETE', `/invites/${INVITE_ID}`, undefined],
      ['DELETE', `/members/${MEMBER_ID}`, undefined],
    ])('%s %s is 401 without a token', async (method, path, body) => {
      const res = await send(method, path, body, false);
      expect(res.status).toBe(401);
      expect(callData).not.toHaveBeenCalled();
    });

    it('is 503 when the data function is not configured', async () => {
      dataConfig = null;
      expect((await send('GET', '/members')).status).toBe(503);
    });
  });

  describe('GET /members', () => {
    it('returns the view as is, calling the data function with the caller token', async () => {
      const res = await send('GET', '/members');
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual(OWNER_VIEW);
      expect(callData).toHaveBeenCalledWith(DATA, token, 'listMembers', {});
    });
    it('maps forbidden to 403', async () => {
      answer({ listMembers: { ok: false, code: 'forbidden' } });
      expect((await send('GET', '/members')).status).toBe(403);
    });
    it('is 503 when the data function throws', async () => {
      answer({ listMembers: new DataFunctionError(500, 'boom') });
      expect((await send('GET', '/members')).status).toBe(503);
    });
    it('is 503 when the data function is busy', async () => {
      answer({ listMembers: { ok: false, code: 'busy' } });
      expect((await send('GET', '/members')).status).toBe(503);
    });
  });

  describe('POST /invites', () => {
    it('creates, emails and returns a bare PendingInvite with createdAt', async () => {
      const res = await send('POST', '/invites', { email: '  Sam@Example.test ' });
      expect(res.status).toBe(201);
      expect(await res.json()).toEqual(INVITE);
      const [, , , args] = sent('createInvite')[0]!;
      expect(args.email).toBe('sam@example.test');
      expect(args.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('does not forward extra fields the data function might return', async () => {
      answer({ createInvite: { ok: true, data: { ...INVITE, tokenHash: 'secret' } } });
      expect(await (await send('POST', '/invites', { email: 'sam@example.test' })).json()).toEqual(INVITE);
    });

    it('never sends the raw token to the data function and puts it in the email only after #t=', async () => {
      await send('POST', '/invites', { email: 'sam@example.test' });
      const mailBody = JSON.parse(emailCalls[0]!);
      const raw = /#t=([A-Za-z0-9_-]{43})/.exec(mailBody.text)![1]!;
      expect(mailBody.text).toContain(`https://app.example.test/join#t=${raw}`);
      expect(emailCalls[0]!.split(raw)).toHaveLength(2);
      for (const call of callData.mock.calls) {
        expect(JSON.stringify(call)).not.toContain(raw);
      }
      expect(sent('createInvite')[0]![3].tokenHash).toBe(await hashInviteToken(raw));
    });

    it('puts the owner name in the email when the profile has one', async () => {
      await send('POST', '/invites', { email: 'sam@example.test' });
      expect(emailCalls[0]).toContain('Ada');
    });

    it.each([
      ['no body', ''],
      ['not json', '{nope'],
      ['array', []],
      ['empty object', {}],
      ['email wrong type', { email: 5 }],
      ['malformed email', { email: 'not-an-email' }],
      ['unknown key', { email: 'sam@example.test', role: 'owner' }],
    ])('400 for %s, before any data call', async (_l, body) => {
      const res = await send('POST', '/invites', body);
      expect(res.status).toBe(400);
      expect(callData).not.toHaveBeenCalled();
    });

    it.each([
      ['invalid', 400],
      ['forbidden', 403],
      ['already_invited', 409],
      ['already_member', 409],
      ['rate_limited', 429],
    ])('maps %s to %i and sends no email', async (code, status) => {
      answer({ createInvite: { ok: false, code } });
      const res = await send('POST', '/invites', { email: 'sam@example.test' });
      expect(res.status).toBe(status);
      expect(emailCalls).toEqual([]);
    });

    it('uses the issue copy for 429', async () => {
      answer({ createInvite: { ok: false, code: 'rate_limited' } });
      const res = await send('POST', '/invites', { email: 'sam@example.test' });
      expect(await res.json()).toEqual({
        error: "You've sent a lot of invitations today. You can send more tomorrow.",
      });
    });

    it('revokes the invite and answers 503 when the email fails', async () => {
      emailStatus = 500;
      const res = await send('POST', '/invites', { email: 'sam@example.test' });
      expect(res.status).toBe(503);
      expect(await res.json()).toEqual({ error: SEND_FAILED });
      expect(sent('revokeInvite')).toHaveLength(1);
      expect(sent('revokeInvite')[0]![3]).toEqual({ id: INVITE_ID });
    });

    it('retries a failed revoke once and still answers 503', async () => {
      emailStatus = 500;
      let n = 0;
      callData.mockImplementation(async (_c, _t, action: string) => {
        if (action === 'revokeInvite') {
          return n++ === 0 ? { ok: false, code: 'busy' } : { ok: true, data: null };
        }
        return action === 'createInvite' ? { ok: true, data: INVITE } : { ok: true, data: null };
      });
      const res = await send('POST', '/invites', { email: 'sam@example.test' });
      expect(res.status).toBe(503);
      expect(sent('revokeInvite')).toHaveLength(2);
    });

    it('answers 503 when both revoke attempts fail', async () => {
      emailStatus = 500;
      answer({ revokeInvite: new DataFunctionError(500, 'x') });
      const res = await send('POST', '/invites', { email: 'sam@example.test' });
      expect(res.status).toBe(503);
      expect(sent('revokeInvite')).toHaveLength(2);
    });

    it('answers 503 and creates nothing when RESEND_API_KEY is unset', async () => {
      mail = { ...MAIL, apiKey: undefined };
      expect((await send('POST', '/invites', { email: 'sam@example.test' })).status).toBe(503);
      expect(sent('createInvite')).toEqual([]);
    });

    it('answers 503 and creates nothing when WEB_URL is not https', async () => {
      mail = { ...MAIL, webUrl: 'http://app.example.test' };
      expect((await send('POST', '/invites', { email: 'sam@example.test' })).status).toBe(503);
      expect(sent('createInvite')).toEqual([]);
    });

    it('answers 503 when the data function is unreachable, and sends no email', async () => {
      answer({ createInvite: new DataFunctionError(null, 'down') });
      expect((await send('POST', '/invites', { email: 'sam@example.test' })).status).toBe(503);
      expect(emailCalls).toEqual([]);
    });

    it('still sends when the owner name cannot be read', async () => {
      answer({ getProfile: new DataFunctionError(500, 'x') });
      expect((await send('POST', '/invites', { email: 'sam@example.test' })).status).toBe(201);
      expect(emailCalls).toHaveLength(1);
    });
  });

  describe('POST /invites/accept', () => {
    const accept = (body: unknown) => send('POST', '/invites/accept', body);

    it('returns the owner id and sends only the hash', async () => {
      const res = await accept({ token: TOKEN });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ownerId: OWNER_ID });
      expect(callData).toHaveBeenCalledWith(DATA, token, 'acceptInvite', { tokenHash: await hashInviteToken(TOKEN) });
      expect(JSON.stringify(sent('acceptInvite')[0]![3])).not.toContain(TOKEN);
    });

    it('every failure cause is the same 404, byte for byte', async () => {
      const outcomes: string[] = [];
      const record = async (res: Response) => {
        const headers: string[] = [];
        res.headers.forEach((v, k) => headers.push(`${k}:${v}`));
        outcomes.push(JSON.stringify({ status: res.status, headers: headers.sort(), text: await res.text() }));
      };
      // Bad shape: never reaches the data function.
      for (const body of [{}, { token: 5 }, { token: 'short' }, { token: TOKEN, extra: 1 }, '{nope', []]) {
        await record(await accept(body));
      }
      expect(callData).not.toHaveBeenCalled();
      // Every domain cause other than conflict and busy.
      for (const code of ['unusable', 'not_found', 'invalid', 'forbidden', 'rate_limited', 'already_invited', 'unauthorized']) {
        answer({ acceptInvite: { ok: false, code } });
        await record(await accept({ token: TOKEN }));
      }
      expect(new Set(outcomes).size).toBe(1);
      expect(JSON.parse(outcomes[0]!)).toMatchObject({ status: 404 });
      expect(JSON.parse(JSON.parse(outcomes[0]!).text)).toEqual({ error: UNUSABLE });
    });

    it.each(['invite_conflict', 'already_member'])('maps %s to 409', async (code) => {
      answer({ acceptInvite: { ok: false, code } });
      expect((await accept({ token: TOKEN })).status).toBe(409);
    });

    it('is 503 when the data function is down or busy, not a token failure', async () => {
      answer({ acceptInvite: new DataFunctionError(500, 'x') });
      expect((await accept({ token: TOKEN })).status).toBe(503);
      answer({ acceptInvite: { ok: false, code: 'busy' } });
      expect((await accept({ token: TOKEN })).status).toBe(503);
    });
  });

  describe.each([
    ['DELETE /invites/:id', (id: string) => `/invites/${id}`, INVITE_ID, 'revokeInvite', 'id', 'not-a-uuid'],
    ['DELETE /members/:memberId', (id: string) => `/members/${id}`, MEMBER_ID, 'removeMember', 'memberId', 'bad id!'],
  ])('%s', (_name, path, id, action, arg, badId) => {
    it('answers 204 with an empty body', async () => {
      const res = await send('DELETE', path(id));
      expect(res.status).toBe(204);
      expect(await res.text()).toBe('');
      expect(callData).toHaveBeenCalledWith(DATA, token, action, { [arg]: id });
    });
    it('400 for a malformed id, before any data call', async () => {
      expect((await send('DELETE', path(badId))).status).toBe(400);
      expect(callData).not.toHaveBeenCalled();
    });
    it.each([
      ['not_found', 404],
      ['forbidden', 403],
    ])('maps %s to %i', async (code, status) => {
      answer({ [action]: { ok: false, code } });
      expect((await send('DELETE', path(id))).status).toBe(status);
    });
    it('is 503 when the data function throws', async () => {
      answer({ [action]: new DataFunctionError(null, 'x') });
      expect((await send('DELETE', path(id))).status).toBe(503);
    });
  });

  it('has no exclamation point in any message (C7)', async () => {
    const codes = ['invalid', 'unauthorized', 'forbidden', 'not_found', 'conflict', 'already_invited', 'rate_limited', 'busy'];
    const copy = [BAD_BODY, BAD_EMAIL, BAD_ID, SEND_FAILED, UNAVAILABLE, UNUSABLE];
    for (const code of codes) {
      copy.push(failureFor(code).error);
    }
    copy.push('Your account already has people in it, so it cannot join another.');
    for (const text of copy) {
      expect(text).not.toContain('!');
    }
  });
});
