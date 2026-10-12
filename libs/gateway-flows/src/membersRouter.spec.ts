import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearJwksCache } from '@griever/gateway-auth';
import { SUPABASE_URL, jsonResponse, makeKeys, signJwt } from '@griever/gateway-auth/testing';
import { hashInviteToken } from './inviteToken.js';
import { createMembersRouter } from './membersRouter.js';

const config = { url: SUPABASE_URL, anonKey: 'anon' };
const MAIL = { apiKey: 're_test_key', from: 'hello@example.test', webUrl: 'https://app.example.test' };
const INVITE_ID = '22222222-2222-4222-8222-222222222222';
const MEMBER_ID = '33333333-3333-4333-8333-333333333333';
const TOKEN = 'A'.repeat(43);
const INVITE = {
  id: INVITE_ID,
  email: 'sam@example.test',
  expiresAt: '2026-10-19T10:00:00.000Z',
  createdAt: '2026-10-12T10:00:00.000Z',
};
const OWNER_VIEW = { role: 'owner', members: [], invites: [INVITE] };
const UNUSABLE = "This invitation can't be used. Ask the person who sent it for a new one.";

const pgError = (code: string, status: number) => jsonResponse({ code, message: 'x' }, status);

describe('members router', () => {
  let keys: Awaited<ReturnType<typeof makeKeys>>;
  let token: string;
  let mail = { ...MAIL } as { apiKey?: string; from?: string; webUrl?: string };
  let supabaseConfig: typeof config | null = config;
  // Per-test answers for each outside call, keyed by URL suffix.
  let answers: Record<string, () => Response>;
  let calls: { url: string; body: string }[];

  const router = createMembersRouter({ getConfig: () => supabaseConfig, getMail: () => mail });

  beforeEach(async () => {
    clearJwksCache();
    keys = await makeKeys();
    token = await signJwt(keys.privateKey, keys.kid);
    mail = { ...MAIL };
    supabaseConfig = config;
    calls = [];
    answers = {
      'rpc/create_invite': () => jsonResponse(INVITE_ID),
      'rpc/list_members': () => jsonResponse(OWNER_VIEW),
      'rpc/revoke_invite': () => new Response(null, { status: 204 }),
      'rpc/remove_member': () => new Response(null, { status: 204 }),
      'rpc/accept_invite': () => jsonResponse('44444444-4444-4444-8444-444444444444'),
      'profiles?select=sender_name&limit=1': () => jsonResponse([{ sender_name: 'Ada' }]),
      'emails': () => jsonResponse({ id: 'e1' }),
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith('/jwks.json') || url.includes('.well-known')) return jsonResponse(keys.jwks);
        calls.push({ url, body: String(init?.body ?? '') });
        const key = Object.keys(answers).find((k) => url.endsWith(k));
        if (!key) throw new Error(`unexpected fetch ${url}`);
        return answers[key]!();
      }),
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  const send = (method: string, path: string, body?: unknown, auth = true) =>
    router.request(path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
    });
  const sentTo = (suffix: string) => calls.filter((c) => c.url.endsWith(suffix));
  const noBackendCalls = () => expect(calls).toEqual([]);

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
      noBackendCalls();
    });

    it('is 503 when Supabase is not configured', async () => {
      supabaseConfig = null;
      expect((await send('GET', '/members')).status).toBe(503);
    });
  });

  describe('GET /members', () => {
    it('returns the view as is', async () => {
      const res = await send('GET', '/members');
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual(OWNER_VIEW);
    });
    it('maps PT403 to 403', async () => {
      answers['rpc/list_members'] = () => pgError('PT403', 403);
      expect((await send('GET', '/members')).status).toBe(403);
    });
    it('is 503 when PostgREST fails', async () => {
      answers['rpc/list_members'] = () => jsonResponse({ message: 'boom' }, 500);
      expect((await send('GET', '/members')).status).toBe(503);
    });
  });

  describe('POST /invites', () => {
    it('creates, emails and returns a bare PendingInvite with createdAt', async () => {
      const res = await send('POST', '/invites', { email: '  Sam@Example.test ' });
      expect(res.status).toBe(201);
      expect(await res.json()).toEqual(INVITE);
      const create = JSON.parse(sentTo('rpc/create_invite')[0]!.body);
      expect(create.p_email).toBe('sam@example.test');
      expect(create.p_token_hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('never sends the raw token to PostgREST and puts it in the email only after #t=', async () => {
      await send('POST', '/invites', { email: 'sam@example.test' });
      const mailBody = JSON.parse(sentTo('emails')[0]!.body);
      const raw = /#t=([A-Za-z0-9_-]{43})/.exec(mailBody.text)![1]!;
      expect(mailBody.text).toContain(`https://app.example.test/join#t=${raw}`);
      expect(mailBody.text.replaceAll(`#t=${raw}`, '')).not.toContain(raw);
      for (const c of calls.filter((x) => x.url.startsWith(SUPABASE_URL))) {
        expect(c.url + c.body).not.toContain(raw);
      }
      expect(JSON.parse(sentTo('rpc/create_invite')[0]!.body).p_token_hash).toBe(await hashInviteToken(raw));
    });

    it.each([
      ['no body', ''],
      ['not json', '{nope'],
      ['array', []],
      ['empty object', {}],
      ['email wrong type', { email: 5 }],
      ['malformed email', { email: 'not-an-email' }],
      ['unknown key', { email: 'sam@example.test', role: 'owner' }],
    ])('400 for %s, before any backend call', async (_l, body) => {
      const res = await send('POST', '/invites', body);
      expect(res.status).toBe(400);
      noBackendCalls();
    });

    it.each([
      ['PT400', 400],
      ['PT403', 403],
      ['PT409', 409],
      ['PT429', 429],
    ])('maps %s to %i and sends no email', async (code, status) => {
      answers['rpc/create_invite'] = () => pgError(code, status);
      const res = await send('POST', '/invites', { email: 'sam@example.test' });
      expect(res.status).toBe(status);
      expect(sentTo('emails')).toEqual([]);
    });

    it('uses the issue copy for 429', async () => {
      answers['rpc/create_invite'] = () => pgError('PT429', 429);
      const res = await send('POST', '/invites', { email: 'sam@example.test' });
      expect(await res.json()).toEqual({
        error: "You've sent a lot of invitations today. You can send more tomorrow.",
      });
    });

    it('revokes the invite and answers 503 when the email fails', async () => {
      answers['emails'] = () => jsonResponse({}, 500);
      const res = await send('POST', '/invites', { email: 'sam@example.test' });
      expect(res.status).toBe(503);
      expect(await res.json()).toEqual({
        error: "The invitation couldn't be sent right now. Please try again in a moment.",
      });
      expect(JSON.parse(sentTo('rpc/revoke_invite')[0]!.body)).toEqual({ p_invite_id: INVITE_ID });
    });

    it('answers 503 and creates nothing when RESEND_API_KEY is unset', async () => {
      mail = { ...MAIL, apiKey: undefined };
      const res = await send('POST', '/invites', { email: 'sam@example.test' });
      expect(res.status).toBe(503);
      expect(sentTo('rpc/create_invite')).toEqual([]);
    });

    it('answers 503 and creates nothing when WEB_URL is not https', async () => {
      mail = { ...MAIL, webUrl: 'http://app.example.test' };
      expect((await send('POST', '/invites', { email: 'sam@example.test' })).status).toBe(503);
      expect(sentTo('rpc/create_invite')).toEqual([]);
    });

    it('revokes when the new invite cannot be read back', async () => {
      answers['rpc/list_members'] = () => jsonResponse({ role: 'owner', members: [], invites: [] });
      expect((await send('POST', '/invites', { email: 'sam@example.test' })).status).toBe(503);
      expect(sentTo('rpc/revoke_invite')).toHaveLength(1);
      expect(sentTo('emails')).toEqual([]);
    });

    it('still sends when the owner name cannot be read', async () => {
      answers['profiles?select=sender_name&limit=1'] = () => jsonResponse({ message: 'x' }, 500);
      expect((await send('POST', '/invites', { email: 'sam@example.test' })).status).toBe(201);
    });
  });

  describe('POST /invites/accept', () => {
    const accept = (body: unknown) => send('POST', '/invites/accept', body);

    it('returns the owner id and sends only the hash', async () => {
      const res = await accept({ token: TOKEN });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ownerId: '44444444-4444-4444-8444-444444444444' });
      const body = sentTo('rpc/accept_invite')[0]!.body;
      expect(JSON.parse(body)).toEqual({ p_token_hash: await hashInviteToken(TOKEN) });
      expect(body).not.toContain(TOKEN);
    });

    it('every failure cause is the same 404, byte for byte', async () => {
      const outcomes: { status: number; headers: string; text: string }[] = [];
      const record = async (res: Response) =>
        outcomes.push({
          status: res.status,
          headers: JSON.stringify((() => { const h: string[] = []; res.headers.forEach((v, k) => h.push(`${k}:${v}`)); return h.sort(); })()),
          text: await res.text(),
        });

      // Bad shape: never reaches PostgREST.
      for (const body of [{}, { token: 5 }, { token: 'short' }, { token: TOKEN, extra: 1 }, '{nope', []]) {
        await record(await accept(body));
      }
      noBackendCalls();
      // Unknown, expired, reused, revoked, wrong email: PostgREST answers PT404 for all of them.
      answers['rpc/accept_invite'] = () => pgError('PT404', 404);
      for (let i = 0; i < 5; i++) await record(await accept({ token: TOKEN }));
      // Defensive: other typed codes from accept never leak a different answer.
      for (const [code, status] of [['PT400', 400], ['PT403', 403], ['PT429', 429]] as const) {
        answers['rpc/accept_invite'] = () => pgError(code, status);
        await record(await accept({ token: TOKEN }));
      }

      expect(new Set(outcomes.map((o) => JSON.stringify(o))).size).toBe(1);
      expect(outcomes[0]).toMatchObject({ status: 404 });
      expect(JSON.parse(outcomes[0]!.text)).toEqual({ error: UNUSABLE });
    });

    it('maps PT409 invite_conflict to 409', async () => {
      answers['rpc/accept_invite'] = () => pgError('PT409', 409);
      expect((await accept({ token: TOKEN })).status).toBe(409);
    });

    it('is 503 when PostgREST is down, not a token failure', async () => {
      answers['rpc/accept_invite'] = () => jsonResponse({}, 500);
      expect((await accept({ token: TOKEN })).status).toBe(503);
    });
  });

  describe.each([
    ['DELETE /invites/:id', (id: string) => `/invites/${id}`, INVITE_ID, 'rpc/revoke_invite', 'p_invite_id'],
    ['DELETE /members/:memberId', (id: string) => `/members/${id}`, MEMBER_ID, 'rpc/remove_member', 'p_member_id'],
  ])('%s', (_name, path, id, rpc, arg) => {
    it('answers 204 with an empty body', async () => {
      const res = await send('DELETE', path(id));
      expect(res.status).toBe(204);
      expect(await res.text()).toBe('');
      expect(JSON.parse(sentTo(rpc)[0]!.body)).toEqual({ [arg]: id });
    });
    it('400 for a non-UUID id, before any backend call', async () => {
      expect((await send('DELETE', path('not-a-uuid'))).status).toBe(400);
      noBackendCalls();
    });
    it.each([
      ['PT404', 404],
      ['PT403', 403],
    ])('maps %s to %i', async (code, status) => {
      answers[rpc] = () => pgError(code, status);
      expect((await send('DELETE', path(id))).status).toBe(status);
    });
  });

  it('has no exclamation point in any message (C7)', async () => {
    const texts: string[] = [];
    const grab = async (res: Response) => texts.push(await res.text());
    for (const code of ['PT400', 'PT403', 'PT404', 'PT409', 'PT429']) {
      answers['rpc/create_invite'] = () => pgError(code, Number(code.slice(2)));
      await grab(await send('POST', '/invites', { email: 'sam@example.test' }));
      answers['rpc/accept_invite'] = () => pgError(code, Number(code.slice(2)));
      await grab(await send('POST', '/invites/accept', { token: TOKEN }));
      answers['rpc/revoke_invite'] = () => pgError(code, Number(code.slice(2)));
      await grab(await send('DELETE', `/invites/${INVITE_ID}`));
    }
    await grab(await send('POST', '/invites', {}));
    expect(texts.length).toBeGreaterThan(10);
    for (const t of texts) expect(t).not.toContain('!');
  });
});
