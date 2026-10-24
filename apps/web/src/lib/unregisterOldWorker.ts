// The old app registered /sw.js for Background Sync. The file is gone, so
// old workers can never update. Remove them once at boot. Never throws.
export async function unregisterOldWorker(): Promise<void> {
  try {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(
      registrations.map(async (reg) => {
        try {
          const worker = reg.active ?? reg.installing ?? reg.waiting;
          if (!worker) return;
          if (new URL(worker.scriptURL).pathname.endsWith('/sw.js')) {
            await reg.unregister();
          }
        } catch {
          /* ignore one bad registration */
        }
      }),
    );
  } catch {
    /* nothing to clean */
  }
}
