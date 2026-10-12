/**
 * True when the page was opened from a password-reset email. Our redirect always carries
 * `?reset=1`; Supabase adds `#…type=recovery` to it. Reads the URL only, never the network.
 */
export function isRecoveryUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.searchParams.get('reset') === '1' ||
      new URLSearchParams(parsed.hash.replace(/^#/, '')).get('type') === 'recovery'
    );
  } catch {
    return false;
  }
}

/** Removes the token and marker from the address bar so they are not kept in history or shared. */
export function clearRecoveryFromAddressBar(): void {
  window.history.replaceState(null, '', window.location.pathname);
}

// Held in memory from app start, so the token is out of the address bar before anything can fail
// (offline, a slow chunk, an error screen) and is still available to read once the client loads.
let captured: string | null = null;

/**
 * Call as early as possible. If the page was opened from a reset email, remembers the full link
 * and clears the address bar at once. Safe to call repeatedly (React may render twice).
 */
export function captureRecoveryLink(): string | null {
  if (captured === null && isRecoveryUrl(window.location.href)) {
    captured = window.location.href;
    clearRecoveryFromAddressBar();
  }
  return captured;
}

/** Hands over the remembered link once; the link is single-use. */
export function takeRecoveryLink(): string {
  const href = captured ?? '';
  captured = null;
  return href;
}

/** `anna@example.com` becomes `a•••@example.com`. */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf('@');
  if (at < 1) return email;
  return `${email[0]}•••${email.slice(at)}`;
}
