import { getOrCreateDeviceId, BACKGROUND_SYNC_TAG } from '@griever/data-sync';
import { metaStore } from '@griever/data-local';

/**
 * Mock identity while `GG_DEV_AUTH` is the auth story (see
 * apps/gateway/convex/auth.ts) — there's no real sign-in to read a user id
 * from yet. Replace this one constant once there is; nothing downstream
 * (the gateway, Convex, the worker) needs to change.
 */
const DEV_USER_ID = 'usr_dev_local';

function resolveGatewayUrl(): string {
  try {
    const viteUrl = (import.meta as { env?: Record<string, string> }).env?.['VITE_API_URL'];
    if (viteUrl) return viteUrl;
  } catch {
    // not in a Vite context
  }
  return 'http://localhost:3001';
}

/**
 * Boots the offline-sync identity (device id, dev user id, gateway URL) into
 * IndexedDB so the Service Worker can find them — it has no `localStorage`
 * access — then registers the worker and its Background Sync tag.
 *
 * Deliberately does NOT call `registerSyncTriggers` (the main-thread flush
 * triggers from `libs/data-sync`): no screen writes to the outbox yet, so
 * there's nothing for them to flush. This just makes the worker itself
 * functional for whenever that lands.
 */
export async function registerSync(): Promise<void> {
  await getOrCreateDeviceId();
  await metaStore.setMetaString('devUserId', DEV_USER_ID);
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
