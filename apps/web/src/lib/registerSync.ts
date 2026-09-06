import {
  getOrCreateDeviceId,
  createGatewayTransport,
  registerSyncTriggers,
  BACKGROUND_SYNC_TAG,
  type TriggerHandle,
} from '@griever/data-sync';
import { metaStore } from '@griever/data-local';

function resolveGatewayUrl(): string {
  try {
    const viteUrl = (import.meta as { env?: Record<string, string> }).env?.['VITE_API_URL'];
    if (viteUrl) return viteUrl;
  } catch {
    // not in a Vite context
  }
  return 'http://localhost:3001';
}

let triggerHandle: TriggerHandle | null = null;

/**
 * Boots the offline-sync identity (device id, gateway URL) into IndexedDB so
 * the Service Worker can find them — it has no `localStorage` access — then
 * registers the worker and its Background Sync tag. Call once at app boot.
 *
 * Deliberately does not start the foreground sync triggers itself — those
 * are scoped to a signed-in user (see `setSyncUserId` below), and at boot
 * nobody is signed in yet until `useIdentity`'s `/auth/session` check
 * resolves (or doesn't).
 */
export async function registerSync(): Promise<void> {
  await getOrCreateDeviceId();
  await metaStore.setMetaString('gatewayUrl', resolveGatewayUrl());

  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

  try {
    await navigator.serviceWorker.register('/sw.js');
    const registration = (await navigator.serviceWorker.ready) as ServiceWorkerRegistration & {
      sync?: { register(tag: string): Promise<void> };
    };
    await registration.sync?.register(BACKGROUND_SYNC_TAG);
  } catch {
    // Registration or Background Sync unavailable (Safari/Firefox lack
    // SyncManager) — the pagehide+keepalive fallback covers it instead.
  }
}

/**
 * Called from `apps/web/src/app/app.tsx` whenever the real signed-in
 * identity resolves or changes (sign-in, sign-out, or the initial
 * `/auth/session` check settling) — `userId` is the real `identities.userId`
 * from `libs/identity`, or null when signed out.
 *
 * This still writes to the `devUserId` meta key and sends the same
 * `x-gg-user` header `createGatewayTransport` always has (see its own
 * comment) — that header is the gateway's existing stand-in for real auth
 * (`GG_DEV_AUTH`, see apps/gateway/convex/auth.ts), and using a real userId
 * here does NOT make that stand-in secure. In any deployment where
 * `GG_DEV_AUTH` isn't set — which must be every real production deploy —
 * `/sync/pull`/`/sync/push` still refuse every request outright. Verifying
 * this bearer session token server-side and replacing the dev stub with it
 * is a separate, not-yet-done piece of work.
 */
export async function setSyncUserId(userId: string | null): Promise<void> {
  triggerHandle?.stop();
  triggerHandle = null;

  await metaStore.setMetaString('devUserId', userId ?? '');
  if (!userId) return;

  const deviceId = await getOrCreateDeviceId();
  const transport = createGatewayTransport({ baseUrl: resolveGatewayUrl(), devUserId: userId });
  triggerHandle = registerSyncTriggers(transport, deviceId);
}
