import { Jwt } from 'hono/utils/jwt';
import { clearClerkCache } from '@griever/gateway-auth';
import { createMembersRouter } from '@griever/gateway-flows';
import { DATA_USER_TOKEN_HEADER, type DataResult } from '@griever/shared';
import type { Caller } from './caller.js';
import { createDataApp } from './handler/app.js';
import { wiredRules } from './lambda.js';
import { createTables, doc, dropTables, required, table, up } from './testing/localTable.js';

/**
 * The gateway member routes against the real data function rules on DynamoDB Local (`pnpm aws:up`).
 * The only fakes are the Clerk key set, the token check, and the mail API. CI runs this with the
 * `data-access` tests in the aws-local job (AWS_LOCAL_REQUIRED=true).
 */
const ISSUER = 'https://clerk.example.test';
const OWNER: Caller = { userId: 'user_sharing_owner', email: 'owner@example.test', emailVerified: true };
const JOINER: Caller = { userId: 'user_sharing_joiner', email: 'joiner@example.test', emailVerified: true };

describe('sharing integration in CI', () => {
  it.runIf(required)('has DynamoDB Local', () => {
    expect(up).toBe(true);
  });
});

describe.runIf(up)('sharing: gateway routes to DynamoDB Local', () => {
  const tokens = new Map<string, Caller>();
  const emails: string[] = [];
  let ownerToken: string;
  let joinerToken: string;
  let router: ReturnType<typeof createMembersRouter>;

  beforeAll(async () => {
    await createTables();
    clearClerkCache();
    const pair = await crypto.subtle.generateKey(
      { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
      true,
      ['sign', 'verify'],
    );
    const privateJwk = { ...(await crypto.subtle.exportKey('jwk', pair.privateKey)), kid: 'k1', alg: 'RS256' };
    const publicJwk = { ...(await crypto.subtle.exportKey('jwk', pair.publicKey)), kid: 'k1', alg: 'RS256' };
    const sign = (caller: Caller) =>
      Jwt.sign(
        { sub: caller.userId, iss: ISSUER, exp: Math.floor(Date.now() / 1000) + 300, email: caller.email },
        privateJwk,
        'RS256',
      );
    ownerToken = await sign(OWNER);
    joinerToken = await sign(JOINER);
    tokens.set(ownerToken, OWNER);
    tokens.set(joinerToken, JOINER);

    const dataApp = createDataApp({ rules: wiredRules, doc, table, verify: async (token) => tokens.get(token) ?? null });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith('/.well-known/jwks.json')) {
          return new Response(JSON.stringify({ keys: [publicJwk] }));
        }
        if (url === 'https://api.resend.com/emails') {
          emails.push(String(init?.body));
          return new Response(JSON.stringify({ id: 'e1' }));
        }
        throw new Error(`unexpected fetch ${url}`);
      }),
    );
    router = createMembersRouter({
      getAuthConfig: () => ({ issuer: ISSUER, authorizedParties: [] }),
      getDataConfig: () => ({ url: 'http://127.0.0.1:3002' }),
      getMail: () => ({ apiKey: 're_test', from: 'hello@example.test', webUrl: 'https://app.example.test' }),
      // Same call the gateway makes, handed to the data app in memory instead of over HTTP.
      callData: (async (_config: unknown, userToken: string, action: string, args: Record<string, unknown> = {}) => {
        const response = await dataApp.request('/v1', {
          method: 'POST',
          headers: { 'content-type': 'application/json', [DATA_USER_TOKEN_HEADER]: userToken },
          body: JSON.stringify({ action, args }),
        });
        if (response.status === 401) {
          return { ok: false, code: 'unauthorized' } as DataResult;
        }
        return (await response.json()) as DataResult;
      }) as never,
    });
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    await dropTables();
  });

  const send = (token: string, method: string, path: string, body?: unknown) =>
    router.request(path, {
      method,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

  it('owner invites, joiner accepts, owner lists the member and removes them', async () => {
    const created = await send(ownerToken, 'POST', '/invites', { email: JOINER.email });
    expect(created.status).toBe(201);
    const invite = (await created.json()) as { id: string; email: string };
    expect(invite.email).toBe(JOINER.email);

    const listed = await send(ownerToken, 'GET', '/members');
    expect(await listed.json()).toMatchObject({ role: 'owner', members: [], invites: [{ id: invite.id }] });

    const raw = /#t=([A-Za-z0-9_-]{43})/.exec(JSON.parse(emails[0]!).text)![1]!;
    const accepted = await send(joinerToken, 'POST', '/invites/accept', { token: raw });
    expect(accepted.status).toBe(200);
    expect(await accepted.json()).toEqual({ ownerId: OWNER.userId });

    const afterAccept = await (await send(ownerToken, 'GET', '/members')).json();
    expect(afterAccept).toMatchObject({
      role: 'owner',
      members: [{ id: JOINER.userId, email: JOINER.email }],
      invites: [],
    });
    expect(await (await send(joinerToken, 'GET', '/members')).json()).toMatchObject({
      role: 'member',
      owner: { id: OWNER.userId },
    });

    const removed = await send(ownerToken, 'DELETE', `/members/${JOINER.userId}`);
    expect(removed.status).toBe(204);
    expect(await (await send(ownerToken, 'GET', '/members')).json()).toMatchObject({ role: 'owner', members: [] });
  });

  it('answers 404 when removing someone who is not your member', async () => {
    expect((await send(ownerToken, 'DELETE', '/members/user_nobody')).status).toBe(404);
  });
});
