import { ConvexHttpClient } from 'convex/browser';

/**
 * The gateway is the only thing in this repo that talks to Convex directly
 * (CLAUDE.md rule 2a). `apps/web` never sees a Convex URL or credential —
 * only this file does.
 *
 * `CONVEX_URL` is the one variable this reads at runtime, and it's the same
 * name in both environments:
 * - Local dev (self-hosted): `npx convex dev` writes it to `.env.local`
 *   automatically, pointing at the Docker backend (see infra/convex/README.md).
 * - Production (Convex Cloud): set as a deploy-time var on the Cloudflare
 *   Worker (see .github/workflows/deploy.yml), pointing at the cloud
 *   deployment `npx convex deploy` pushes to.
 *
 * `CONVEX_SELF_HOSTED_URL` is a fallback for the rare case `.env.local`
 * hasn't been generated yet but `.env` has — deploying (step 1 of
 * infra/convex/README.md) always produces `CONVEX_URL` shortly after.
 */
let client: ConvexHttpClient | null = null;

export function getConvexClient(): ConvexHttpClient | null {
  if (client) return client;
  const url = process.env['CONVEX_URL'] ?? process.env['CONVEX_SELF_HOSTED_URL'];
  if (!url) return null;
  client = new ConvexHttpClient(url, { skipConvexDeploymentUrlCheck: true });
  return client;
}
