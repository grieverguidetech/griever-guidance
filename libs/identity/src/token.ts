/**
 * Minimal signed tokens (HMAC-SHA256, Web Crypto — works unmodified on both
 * Node and Cloudflare Workers, no JWT library needed). Two unrelated things
 * both need "prove this wasn't tampered with, and expires": the OAuth
 * `state` param (short-lived, carries where to send the browser back to)
 * and the session bearer token (long-lived, carries who signed in). One
 * implementation, two callers, in router.ts.
 */

export interface TokenPayload {
  [key: string]: unknown;
  exp: number; // unix ms
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// No explicit `CryptoKey`/`BufferSource` type names below, and no reliance on
// the "dom" lib at all — this file is type-checked not just under its own
// tsconfig (which includes "dom") but also, via project references +
// workspace packages resolving straight to source, under apps/gateway's
// tsconfig (Node-only "es2022" lib, no "dom"). Those two interface names
// don't exist in that second context even though the same `crypto.subtle`
// Web Crypto API is available and works identically at runtime in both.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function hmacKey(secret: string): Promise<any> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

export async function signToken(
  payload: Record<string, unknown>,
  secret: string,
  ttlSeconds: number,
): Promise<string> {
  const full: TokenPayload = { ...payload, exp: Date.now() + ttlSeconds * 1000 };
  const body = toBase64Url(new TextEncoder().encode(JSON.stringify(full)));
  const key = await hmacKey(secret);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body) as any);
  return `${body}.${toBase64Url(new Uint8Array(signature))}`;
}

/** Returns null for anything wrong with the token — malformed, tampered, or expired — never throws. */
export async function verifyToken<T extends TokenPayload = TokenPayload>(
  token: string,
  secret: string,
): Promise<T | null> {
  const [body, signature] = token.split('.');
  if (!body || !signature) return null;
  try {
    const key = await hmacKey(secret);
    const valid = await crypto.subtle.verify(
      'HMAC',
      key,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      fromBase64Url(signature) as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      new TextEncoder().encode(body) as any,
    );
    if (!valid) return null;
    const payload = JSON.parse(new TextDecoder().decode(fromBase64Url(body))) as T;
    if (typeof payload.exp !== 'number' || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}
