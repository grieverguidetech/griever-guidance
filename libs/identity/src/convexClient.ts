import { ConvexHttpClient } from 'convex/browser';

/**
 * Its own tiny Convex client, deliberately not shared with
 * `libs/gateway-sync`'s — CLAUDE.md rule 2b's "no cross-imports between
 * gateway domain libs" extends to identity too, so this ten-line duplicate
 * is the cost of keeping identity independent rather than coupling two
 * domains that should be able to change without touching each other.
 */
let client: ConvexHttpClient | null = null;

export function getConvexClient(): ConvexHttpClient | null {
  if (client) return client;
  const url = process.env['CONVEX_URL'] ?? process.env['CONVEX_SELF_HOSTED_URL'];
  if (!url) return null;
  client = new ConvexHttpClient(url, { skipConvexDeploymentUrlCheck: true });
  return client;
}
