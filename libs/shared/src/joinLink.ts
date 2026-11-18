import { INVITE_TOKEN_PATTERN } from './members.js';

/** The one place an invitation link points to: the web app's /join page. */
export const JOIN_LINK_ORIGIN = 'https://web.grieversguidance.com';
export const JOIN_LINK_PATH = '/join';

/**
 * The token in an invitation link `https://web.grieversguidance.com/join#t=<token>`, or null.
 *
 * Strict on purpose: https, exactly this host, exactly this path, and the token in the fragment only
 * (a fragment is never sent to a server). A query string (`?t=`), another host, and any custom scheme
 * (another app could claim one and read the token) all give null. Written without `URL` because the
 * phone's runtime does not implement all of it.
 */
export function joinTokenFromUrl(href: string): string | null {
  const prefix = `${JOIN_LINK_ORIGIN}${JOIN_LINK_PATH}#`;
  if (!href.startsWith(prefix)) {
    return null;
  }
  const tokens = href
    .slice(prefix.length)
    .split('&')
    .filter((pair) => pair.startsWith('t='))
    .map((pair) => pair.slice(2));
  if (tokens.length !== 1) {
    return null;
  }
  return INVITE_TOKEN_PATTERN.test(tokens[0]) ? tokens[0] : null;
}
