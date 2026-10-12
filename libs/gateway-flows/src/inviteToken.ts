// The invite token is a single-use secret. Only its SHA-256 hex is stored or compared; the token
// itself travels once, in the email link's fragment.

function toBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** 32 random bytes as base64url: 43 characters, matching `INVITE_TOKEN_PATTERN` in shared. */
export function newInviteToken(): string {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(32)));
}

/** SHA-256 of the token as lowercase hex (Web Crypto, so it works on Workers and Node). */
export async function hashInviteToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
