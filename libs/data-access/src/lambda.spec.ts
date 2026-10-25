import { DATA_USER_TOKEN_HEADER } from '@griever/shared';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { createHandler, loadVerifier, wiredRules } from './lambda.js';

const ENV = {
  GG_DATA_TABLE: 'gg-data-test',
  AWS_REGION: 'us-east-1',
  DATA_AUTH_ISSUER: 'https://clerk.example.test',
  DATA_AUTH_JWKS_URL: 'https://clerk.example.test/.well-known/jwks.json',
};

/** A Lambda function URL event, payload format 2.0. */
function event(overrides: { method?: string; path?: string; headers?: Record<string, string>; body?: string | null }) {
  const method = overrides.method ?? 'POST';
  const path = overrides.path ?? '/v1';
  return {
    version: '2.0',
    routeKey: '$default',
    rawPath: path,
    rawQueryString: '',
    headers: { host: 'abc.lambda-url.us-east-1.on.aws', 'content-type': 'application/json', ...overrides.headers },
    requestContext: {
      accountId: 'anonymous',
      apiId: 'abc',
      domainName: 'abc.lambda-url.us-east-1.on.aws',
      domainPrefix: 'abc',
      http: { method, path, protocol: 'HTTP/1.1', sourceIp: '203.0.113.9', userAgent: 'test' },
      requestId: 'req-1',
      routeKey: '$default',
      stage: '$default',
      time: '24/Oct/2026:12:00:00 +0000',
      timeEpoch: 1792843200000,
    },
    body: overrides.body === undefined ? JSON.stringify({ action: 'listFlows', args: {} }) : overrides.body,
    isBase64Encoded: false,
  };
}

// The fixture events never carry a valid token, so the app refuses before DynamoDB or the key list is reached.
const invoke = (e: ReturnType<typeof event>) => createHandler(ENV)(e as never, {} as never) as Promise<{
  statusCode: number;
  body: string;
}>;

describe('Lambda adapter', () => {
  it('answers 401 for a function URL event with no user token', async () => {
    const result = await invoke(event({}));
    expect(result.statusCode).toBe(401);
    expect(JSON.parse(result.body)).toEqual({ error: 'unauthorized' });
  });

  it('answers 401 for a token that is not a JWT, without fetching keys', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const result = await invoke(event({ headers: { [DATA_USER_TOKEN_HEADER]: 'not-a-jwt' } }));
    expect(result.statusCode).toBe(401);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('reads the user token header from the event, in any letter case Lambda delivers', async () => {
    const result = await invoke(event({ headers: { 'X-GG-User-Token': 'not-a-jwt' }, body: '{nope' }));
    // A 401 and not a 400: the header was found, the token was judged first.
    expect(result.statusCode).toBe(401);
  });

  it('answers 404 for another path and for another method', async () => {
    expect((await invoke(event({ path: '/v2' }))).statusCode).toBe(404);
    expect((await invoke(event({ method: 'GET', body: null }))).statusCode).toBe(404);
  });

  it('refuses to start without a table name or auth settings', () => {
    expect(() => createHandler({ ...ENV, GG_DATA_TABLE: '' })).toThrow('GG_DATA_TABLE');
    expect(() => createHandler({ ...ENV, AWS_REGION: '' })).toThrow('AWS_REGION');
    expect(() => createHandler({ ...ENV, DATA_AUTH_ISSUER: undefined })).toThrow('DATA_AUTH_ISSUER');
    expect(() => loadVerifier({ ...ENV, DATA_AUTH_JWKS_URL: ' ' })).toThrow('DATA_AUTH_JWKS_URL');
  });
});

describe('Lambda adapter with a stub verifier', () => {
  const caller = { userId: 'user_lambda', email: 'l@example.test', emailVerified: true };
  const listFlows = vi.fn(async () => []);
  const putProfile = vi.fn(async () => ({ ok: true as const, value: { userId: 'user_lambda' } }));
  const stubbed = createHandler(ENV, {
    rules: { ...wiredRules, listFlows, putProfile } as never,
    doc: {} as DynamoDBDocumentClient,
    verify: async (token) => (token === 'good-token' ? caller : null),
  });
  const run = (e: ReturnType<typeof event>) =>
    stubbed(e as never, {} as never) as Promise<{ statusCode: number; body: string }>;

  it('finds X-GG-User-Token in any letter case and reaches the rule', async () => {
    const result = await run(event({ headers: { 'X-GG-User-Token': 'good-token' } }));
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toEqual({ ok: true, data: [] });
    expect(listFlows).toHaveBeenCalled();
  });

  it('decodes a base64 body', async () => {
    const body = Buffer.from(JSON.stringify({ action: 'putProfile', args: { fields: { senderName: 'Pat' } } })).toString('base64');
    const e = { ...event({ headers: { [DATA_USER_TOKEN_HEADER]: 'good-token' }, body }), isBase64Encoded: true };
    expect((await run(e)).statusCode).toBe(200);
    expect(putProfile).toHaveBeenCalledWith(expect.anything(), expect.anything(), caller, { senderName: 'Pat' }, expect.anything());
  });

  it('answers 400 for a body that is not valid base64 JSON', async () => {
    const e = { ...event({ headers: { [DATA_USER_TOKEN_HEADER]: 'good-token' }, body: '!!!not base64!!!' }), isBase64Encoded: true };
    expect((await run(e)).statusCode).toBe(400);
  });
});

describe('wiredRules', () => {
  it('has a rule for every action, and acceptInvite waits for #272', () => {
    expect(Object.keys(wiredRules).sort()).toEqual(
      ['acceptInvite', 'createFlow', 'createInvite', 'getProfile', 'listFlows', 'listMembers', 'putProfile', 'removeMember', 'revokeInvite', 'updateFlow'],
    );
    expect(() => (wiredRules.acceptInvite as () => unknown)()).toThrow('acceptInvite is not wired yet');
  });
});
