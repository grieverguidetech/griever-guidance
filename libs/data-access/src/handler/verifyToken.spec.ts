import { Jwt } from 'hono/utils/jwt';
import { createTokenVerifier } from './verifyToken.js';

const ISSUER = 'https://clerk.example.test';
const JWKS_URL = `${ISSUER}/.well-known/jwks.json`;

async function makeKey(kid: string) {
  const pair = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  );
  const privateJwk = { ...(await crypto.subtle.exportKey('jwk', pair.privateKey)), kid, alg: 'RS256' };
  const publicJwk = { ...(await crypto.subtle.exportKey('jwk', pair.publicKey)), kid, alg: 'RS256' };
  return { privateJwk, publicJwk };
}

const nowSeconds = () => Math.floor(Date.now() / 1000);
const goodClaims = () => ({
  sub: 'user_abc123',
  iss: ISSUER,
  exp: nowSeconds() + 300,
  email: '  Pat@Example.TEST ',
  email_verified: true,
});

const jwksFetch = (...keys: object[]) => vi.fn(async () => Response.json({ keys }));

describe('createTokenVerifier', () => {
  it('builds the caller from the claims, with the email trimmed and lower-cased', async () => {
    const { privateJwk, publicJwk } = await makeKey('k1');
    const verify = createTokenVerifier({ issuer: ISSUER, jwksUrl: JWKS_URL, fetch: jwksFetch(publicJwk) });
    const token = await Jwt.sign(goodClaims(), privateJwk);
    expect(await verify(token)).toEqual({ userId: 'user_abc123', email: 'pat@example.test', emailVerified: true });
  });

  it('treats a missing or non-boolean email_verified as false', async () => {
    const { privateJwk, publicJwk } = await makeKey('k1');
    const verify = createTokenVerifier({ issuer: ISSUER, jwksUrl: JWKS_URL, fetch: jwksFetch(publicJwk) });
    const { email_verified: _drop, ...rest } = goodClaims();
    expect((await verify(await Jwt.sign(rest, privateJwk)))?.emailVerified).toBe(false);
    expect((await verify(await Jwt.sign({ ...rest, email_verified: 'true' }, privateJwk)))?.emailVerified).toBe(false);
  });

  it.each([
    ['a wrong issuer', { iss: 'https://evil.example.test' }],
    ['an expired token', { exp: nowSeconds() - 10 }],
    ['no expiry', { exp: undefined }],
    ['no email', { email: undefined }],
    ['a blank email', { email: '   ' }],
    ['a non-string email', { email: 5 }],
    ['no subject', { sub: undefined }],
    ['a subject that is not a valid user id', { sub: 'user#1' }],
  ])('refuses %s', async (_name, change) => {
    const { privateJwk, publicJwk } = await makeKey('k1');
    const verify = createTokenVerifier({ issuer: ISSUER, jwksUrl: JWKS_URL, fetch: jwksFetch(publicJwk) });
    expect(await verify(await Jwt.sign({ ...goodClaims(), ...change }, privateJwk))).toBeNull();
  });

  it('refuses a token signed by a different key with the same key id', async () => {
    const trusted = await makeKey('k1');
    const attacker = await makeKey('k1');
    const verify = createTokenVerifier({ issuer: ISSUER, jwksUrl: JWKS_URL, fetch: jwksFetch(trusted.publicJwk) });
    expect(await verify(await Jwt.sign(goodClaims(), attacker.privateJwk))).toBeNull();
  });

  it('refuses garbage, a token with an unknown key id, and an HS256 token', async () => {
    const { publicJwk } = await makeKey('k1');
    const verify = createTokenVerifier({ issuer: ISSUER, jwksUrl: JWKS_URL, fetch: jwksFetch(publicJwk) });
    expect(await verify('not-a-jwt')).toBeNull();
    const stranger = await makeKey('other');
    expect(await verify(await Jwt.sign(goodClaims(), stranger.privateJwk))).toBeNull();
    expect(await verify(await Jwt.sign(goodClaims(), 'a-shared-secret', 'HS256'))).toBeNull();
  });

  it('fetches the keys once and reuses them', async () => {
    const { privateJwk, publicJwk } = await makeKey('k1');
    const fetcher = jwksFetch(publicJwk);
    const verify = createTokenVerifier({ issuer: ISSUER, jwksUrl: JWKS_URL, fetch: fetcher });
    const token = await Jwt.sign(goodClaims(), privateJwk);
    await verify(token);
    await verify(token);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledWith(JWKS_URL);
  });

  it('refreshes once for an unknown key id, but not more than once a minute', async () => {
    const first = await makeKey('k1');
    const second = await makeKey('k2');
    let clock = 0;
    let published: object[] = [first.publicJwk];
    const fetcher = vi.fn(async () => Response.json({ keys: published }));
    const verify = createTokenVerifier({ issuer: ISSUER, jwksUrl: JWKS_URL, fetch: fetcher, now: () => clock });
    await verify(await Jwt.sign(goodClaims(), first.privateJwk));
    published = [first.publicJwk, second.publicJwk];
    const rotated = await Jwt.sign(goodClaims(), second.privateJwk);
    // Too soon: the unknown key id does not cause a second fetch.
    clock = 30_000;
    expect(await verify(rotated)).toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(1);
    clock = 61_000;
    expect((await verify(rotated))?.userId).toBe('user_abc123');
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('throws, rather than answering as a bad token, when the key list cannot be fetched', async () => {
    const { privateJwk } = await makeKey('k1');
    const verify = createTokenVerifier({
      issuer: ISSUER,
      jwksUrl: JWKS_URL,
      fetch: vi.fn(async () => new Response('down', { status: 503 })),
    });
    await expect(verify(await Jwt.sign(goodClaims(), privateJwk))).rejects.toThrow('signing keys');
  });
});
