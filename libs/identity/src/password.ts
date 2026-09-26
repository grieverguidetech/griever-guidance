/**
 * Password hashing for email/password accounts — PBKDF2-SHA256 via Web
 * Crypto (same "no new dependency, works unmodified on Node and Cloudflare
 * Workers" reasoning as token.ts, including its same avoidance of naming
 * DOM-only types like `CryptoKey`/`BufferSource` directly — see that file's
 * comment for why).
 */

const ITERATIONS = 100_000;
const HASH_BYTES = 32;
const SALT_BYTES = 16;

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function fromHex(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

async function deriveHash(password: string, salt: Uint8Array): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const keyMaterial = await crypto.subtle.importKey('raw', new TextEncoder().encode(password) as any, 'PBKDF2', false, [
    'deriveBits',
  ]);
  const bits = await crypto.subtle.deriveBits(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { name: 'PBKDF2', salt: salt as any, iterations: ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    HASH_BYTES * 8,
  );
  return toHex(new Uint8Array(bits));
}

export async function hashPassword(password: string): Promise<{ hash: string; salt: string }> {
  const saltBytes = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const hash = await deriveHash(password, saltBytes);
  return { hash, salt: toHex(saltBytes) };
}

/** Constant-time-ish comparison — never short-circuits on the first differing character. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function verifyPassword(password: string, hash: string, salt: string): Promise<boolean> {
  const computed = await deriveHash(password, fromHex(salt));
  return safeEqual(computed, hash);
}
