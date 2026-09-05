// Griever Guidance — background outbox flush.
//
// Wakes on the Background Sync event registered by
// apps/web/src/lib/registerSync.ts (tag: "gg-outbox-flush", DATA.md §4.5) and
// checks whether there's anything unsynced. An empty outbox is a no-op — no
// network call — a non-empty one gets pushed to the gateway once.
//
// Deliberately plain JS, not TypeScript, and deliberately NOT importing
// @griever/data-local / @griever/data-sync: a Service Worker can only use
// real npm-package imports if they're bundled into it first, and setting up
// a bundled build for this one file is more machinery than this pass calls
// for. This duplicates the minimal slice of outbox-flush logic instead of
// reusing libs/data-sync's `flush()` — if a bundled SW build gets set up
// later, reconcile the two rather than let them drift silently.
//
// This worker only pushes local changes up. It does not pull remote changes
// down (that needs the same merge logic as pulling on the main thread, which
// is the part that's genuinely worth sharing via a bundle rather than
// re-implementing here) — pulling stays a main-thread-only concern via
// libs/data-sync's triggers while the tab is open.

const DB_NAME = 'gg';
const SYNC_TAG = 'gg-outbox-flush';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('sync', (event) => {
  if (event.tag === SYNC_TAG) {
    event.waitUntil(checkAndFlush());
  }
});

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function getAll(db, storeName) {
  return new Promise((resolve, reject) => {
    const req = db.transaction(storeName, 'readonly').objectStore(storeName).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function get(db, storeName, key) {
  return new Promise((resolve, reject) => {
    const req = db.transaction(storeName, 'readonly').objectStore(storeName).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function removeKeys(db, storeName, keys) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    for (const key of keys) store.delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function put(db, storeName, value) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).put(value);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** The staleness check the product asked for: no unsynced ops, no network call. */
async function checkAndFlush() {
  const db = await openDb();
  const ops = await getAll(db, 'outbox');
  if (ops.length === 0) return; // not stale — do nothing

  const [deviceRecord, userRecord, gatewayRecord] = await Promise.all([
    get(db, 'meta', 'deviceId'),
    get(db, 'meta', 'devUserId'),
    get(db, 'meta', 'gatewayUrl'),
  ]);
  const deviceId = deviceRecord && deviceRecord.value;
  const devUserId = userRecord && userRecord.value;
  const gatewayUrl = (gatewayRecord && gatewayRecord.value) || 'http://localhost:3001';
  if (!deviceId) return; // the app has never booted in this browser profile — nothing to identify with

  const headers = { 'Content-Type': 'application/json' };
  if (devUserId) headers['x-gg-user'] = devUserId;

  const response = await fetch(`${gatewayUrl}/sync/push`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      deviceId,
      ops: ops.map((op) => ({
        opId: String(op.opId),
        sessionId: op.sessionId,
        type: op.type,
        patch: op.patch,
        createdAt: op.createdAt,
      })),
    }),
  });

  if (!response.ok) {
    // Throwing here rejects `event.waitUntil()`, which tells the browser
    // this sync attempt failed — it will retry with its own backoff later.
    // Silent by design (DATA.md §4.6): no UI surface for a background flush.
    throw new Error(`gateway push failed: ${response.status}`);
  }

  await removeKeys(
    db,
    'outbox',
    ops.map((op) => op.opId)
  );

  const { acks } = await response.json();
  let maxSeq = 0;
  for (const ack of acks) if (ack.seq > maxSeq) maxSeq = ack.seq;
  if (maxSeq > 0) {
    const cursorRecord = await get(db, 'meta', 'syncCursor');
    const current = (cursorRecord && cursorRecord.value) || 0;
    await put(db, 'meta', { key: 'syncCursor', value: Math.max(current, maxSeq) });
  }
}
