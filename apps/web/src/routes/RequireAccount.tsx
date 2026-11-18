/**
 * The sign-in guard (#851). One pure rule, so the App and the tests share one answer to "where does
 * this person go?". The App renders `<Navigate replace>` to the path this returns, so a guard move
 * never adds a history entry.
 */
import { paths, safeNext } from './paths';

/**
 * Where the account stands, as the guard needs it.
 * - `off`: accounts are switched off (VITE_FEATURE_AUTH is not "true").
 * - `local`: accounts can't be reached, but this device holds the signed-in marker (local work).
 * - `loading`: Clerk or the stored session is still being checked.
 * - `stay`: signed out while this page was open (a session that ended elsewhere, or the account
 *   being deleted). The page stays, with its note; no hard redirect.
 * - `left`: signed out with the Sign out button.
 */
export type AccountState = 'off' | 'local' | 'loading' | 'signed_in' | 'signed_out' | 'stay' | 'left';

/** `/sign-in` and Clerk's own steps under it (`/sign-in/factor-one`, `/sign-in/create`, ...). */
export function isSignInPath(pathname: string): boolean {
  return pathname === '/sign-in' || pathname.startsWith('/sign-in/');
}

/** The paths that need an account: the landing, Your people, a person, the empty pages and Your account. */
export function isAuthRoute(pathname: string): boolean {
  return (
    pathname === '/' ||
    pathname === '/people' ||
    pathname.startsWith('/people/') ||
    pathname === '/start' ||
    pathname.startsWith('/start/') ||
    pathname === '/account'
  );
}

/**
 * The path to replace the current entry with, or null to stay. `next` only ever holds a path from the
 * table (ids, no names): `paths.signIn` and `safeNext` refuse anything else and fall back to `/`.
 */
export function requireAccount({ pathname, search, account }: { pathname: string; search: string; account: AccountState }): string | null {
  const next = new URLSearchParams(search).get('next') ?? undefined;
  if (pathname === '/sign-up') {
    return account === 'off' ? '/' : paths.signIn(next);
  }
  if (isSignInPath(pathname)) {
    if (account === 'off') {
      return '/';
    }
    if (account === 'signed_in' || account === 'local') {
      return safeNext(next);
    }
    return null;
  }
  if (!isAuthRoute(pathname)) {
    return null;
  }
  if (account === 'signed_out') {
    return paths.signIn(pathname);
  }
  if (account === 'left') {
    // The next sign-in lands afresh instead of reopening the page they signed out from.
    return paths.signIn();
  }
  return null;
}
