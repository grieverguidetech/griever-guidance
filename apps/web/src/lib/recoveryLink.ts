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
