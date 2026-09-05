import { flush, syncNow } from "./cursorClient.js";
import type { SyncTransport } from "./transport.js";

const IDLE_MS = 5_000;
const FOREGROUND_TICK_MS = 60_000;

/** Also used by `apps/web/public/sw.js` to match the tag it listens for on the `sync` event. */
export const BACKGROUND_SYNC_TAG = "gg-outbox-flush";

export interface TriggerHandle {
  /** Call after every local edit — drives the "idle 5s after last edit" row of §4.5. */
  noteEdit(): void;
  stop(): void;
}

interface BackgroundSyncRegistration extends ServiceWorkerRegistration {
  sync?: { register(tag: string): Promise<void> };
}

async function registerBackgroundSync(): Promise<void> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  try {
    const registration = (await navigator.serviceWorker.ready) as BackgroundSyncRegistration;
    await registration.sync?.register(BACKGROUND_SYNC_TAG);
  } catch {
    // SyncManager unavailable (most browsers besides Chromium) — the
    // pagehide+keepalive fallback below covers it, and the outbox covers
    // whatever's missed at next boot (§4.5).
  }
}

/**
 * Wires every trigger in DATA.md §4.5's table. Call once at app boot with a
 * live transport. Silent throughout — no UI surface (§4.6); failures retry
 * via the caller's own backoff wrapper around `flush`/`syncNow`, not here.
 */
export function registerSyncTriggers(transport: SyncTransport, deviceId: string): TriggerHandle {
  const teardowns: Array<() => void> = [];
  let idleTimer: ReturnType<typeof setTimeout> | undefined;

  const doFlush = () => {
    void flush(transport, deviceId);
  };
  const doSyncNow = () => {
    void syncNow(transport, deviceId);
  };

  // App boot, online (§4.5 row 1)
  if (typeof navigator === "undefined" || navigator.onLine) doSyncNow();

  if (typeof document !== "undefined") {
    const onVisibility = () => {
      if (document.visibilityState === "hidden") doFlush();
    };
    document.addEventListener("visibilitychange", onVisibility);
    teardowns.push(() => document.removeEventListener("visibilitychange", onVisibility));

    document.addEventListener("freeze", doFlush as EventListener);
    teardowns.push(() => document.removeEventListener("freeze", doFlush as EventListener));
  }

  if (typeof window !== "undefined") {
    window.addEventListener("pagehide", doFlush);
    teardowns.push(() => window.removeEventListener("pagehide", doFlush));

    // `beforeunload` is not reliable on mobile web (§4.5) — `pagehide` above
    // plus a `keepalive` fetch inside the transport's push call is the
    // fallback path; the outbox covers anything still missed at next boot.

    window.addEventListener("online", doSyncNow);
    teardowns.push(() => window.removeEventListener("online", doSyncNow));

    const interval = window.setInterval(doFlush, FOREGROUND_TICK_MS);
    teardowns.push(() => window.clearInterval(interval));
  }

  void registerBackgroundSync();

  return {
    noteEdit() {
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(doFlush, IDLE_MS);
    },
    stop() {
      if (idleTimer) clearTimeout(idleTimer);
      for (const teardown of teardowns) teardown();
    },
  };
}
