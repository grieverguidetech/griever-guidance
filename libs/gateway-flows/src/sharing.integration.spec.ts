import { Jwt } from 'hono/utils/jwt';
import { clearClerkCache } from '@griever/gateway-auth';
import { DeleteTableCommand } from '@aws-sdk/client-dynamodb';
import { createDataApp, wiredRules, type Caller } from '@griever/data-access';
import {
  createDocClient,
  createDynamoClient,
  ensureTables,
  isDynamoReachable,
  loadLocalConfig,
} from '@griever/data-aws';
import { DATA_USER_TOKEN_HEADER, type DataResult } from '@griever/shared';
import { createFlowsRouter } from './flowsRouter.js';
import { createMembersRouter } from './membersRouter.js';

// A random table pair on DynamoDB Local for this file. CI sets AWS_LOCAL_REQUIRED=true.
const suffix = Math.random().toString(36).slice(2, 8);
const config = { ...loadLocalConfig(), dataTable: `gg-test-flows-${suffix}`, contentTable: `gg-test-flows-c-${suffix}` };
const dynamo = createDynamoClient(config);
const doc = createDocClient(dynamo);
const table = config.dataTable;
const up = await isDynamoReachable(dynamo);
const required = process.env['AWS_LOCAL_REQUIRED'] === 'true';

/**
 * The gateway member routes against the real data function rules on DynamoDB Local (`pnpm aws:up`).
 * The only fakes are the Clerk key set, the token check, and the mail API. CI runs this with the
 * `gateway-flows` tests in the aws-local job (AWS_LOCAL_REQUIRED=true).
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
  let flows: ReturnType<typeof createFlowsRouter>;

  beforeAll(async () => {
    await ensureTables(dynamo, config);
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
    // Same call the gateway makes, handed to the data app in memory instead of over HTTP.
    const callData = (async (_config: unknown, userToken: string, action: string, args: Record<string, unknown> = {}) => {
      const response = await dataApp.request('/v1', {
        method: 'POST',
        headers: { 'content-type': 'application/json', [DATA_USER_TOKEN_HEADER]: userToken },
        body: JSON.stringify({ action, args }),
      });
      if (response.status === 401) {
        return { ok: false, code: 'unauthorized' } as DataResult;
      }
      return (await response.json()) as DataResult;
    }) as never;
    router = createMembersRouter({
      getAuthConfig: () => ({ issuer: ISSUER, authorizedParties: [] }),
      getDataConfig: () => ({ url: 'http://127.0.0.1:3002' }),
      getMail: () => ({ apiKey: 're_test', from: 'hello@example.test', webUrl: 'https://app.example.test' }),
      callData,
    });
    flows = createFlowsRouter({
      getAuthConfig: () => ({ issuer: ISSUER, authorizedParties: [] }),
      getDataConfig: () => ({ url: 'http://127.0.0.1:3002' }),
      callData,
    });
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    for (const TableName of [config.dataTable, config.contentTable]) {
      await dynamo.send(new DeleteTableCommand({ TableName }));
    }
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

  // Runs after the test above, which removed the member. Invites again, so the joiner helps the owner.
  describe('person details through /flows', () => {
    const FLOW_ID = '55555555-5555-4555-8555-555555555555';
    const FACTS = {
      personName: 'Margaret Hayes',
      dateOfPassing: 'May 29, 2026',
      serviceDate: null,
      obituaryUrl: null,
      obituaryPublisher: null,
      serviceReady: false,
    };
    const sendFlows = (token: string, method: string, path: string, body?: unknown) =>
      flows.request(path, {
        method,
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    const listed = async (token: string) =>
      (await (await sendFlows(token, 'GET', '/flows')).json()) as {
        id: string;
        role: string;
        details: Record<string, unknown>;
      }[];

    it('owner creates with details; a member reads them, edits one key, and a second device sees it', async () => {
      const created = await sendFlows(ownerToken, 'POST', '/flows', {
        id: FLOW_ID,
        ...FACTS,
        serviceType: 'Funeral',
        servicePlace: 'St. Mary',
        serviceMessage: null,
        burialPrivate: true,
        serviceStatus: 'ready',
      });
      expect(created.status).toBe(201);

      // Owner, second device: a fresh GET returns the same detail keys.
      const ownerView = (await listed(ownerToken)).find((f) => f.id === FLOW_ID);
      expect(ownerView).toMatchObject({
        role: 'owner',
        details: { serviceType: 'Funeral', servicePlace: 'St. Mary', serviceMessage: null, burialPrivate: true, serviceStatus: 'ready' },
      });

      // Make the joiner a member.
      const invite = await send(ownerToken, 'POST', '/invites', { email: JOINER.email });
      expect(invite.status).toBe(201);
      const raw = /#t=([A-Za-z0-9_-]{43})/.exec(JSON.parse(emails.at(-1)!).text)![1]!;
      expect((await send(joinerToken, 'POST', '/invites/accept', { token: raw })).status).toBe(200);

      const memberView = (await listed(joinerToken)).find((f) => f.id === FLOW_ID);
      expect(memberView).toMatchObject({
        role: 'member',
        details: { serviceType: 'Funeral', burialPrivate: true, serviceStatus: 'ready' },
      });

      // The member changes one detail; other keys stay as they were.
      const patched = await sendFlows(joinerToken, 'PATCH', `/flows/${FLOW_ID}`, { servicePlace: 'Chapel' });
      expect(patched.status).toBe(200);
      const after = (await listed(ownerToken)).find((f) => f.id === FLOW_ID);
      expect(after?.details).toMatchObject({ servicePlace: 'Chapel', serviceType: 'Funeral', burialPrivate: true });
    });

    it('refuses a forbidden key before it reaches the data function', async () => {
      const res = await sendFlows(ownerToken, 'PATCH', `/flows/${FLOW_ID}`, { drafts: {} });
      expect(res.status).toBe(400);
    });

    it('does not let a member create a person', async () => {
      const res = await sendFlows(joinerToken, 'POST', '/flows', { id: '66666666-6666-4666-8666-666666666666', ...FACTS });
      expect(res.status).toBe(403);
    });
  });

  it('answers 404 when removing someone who is not your member', async () => {
    expect((await send(ownerToken, 'DELETE', '/members/user_nobody')).status).toBe(404);
  });
});
