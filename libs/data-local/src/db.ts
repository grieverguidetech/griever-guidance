import { openDB, DBSchema, IDBPDatabase } from "idb";
import type { Contact, SessionDocument } from "@griever/shared";

/** DATA.md §1 — the outbox op the client appends before applying any local change. */
export interface OutboxOp {
  opId: number; // autoInc
  sessionId: string;
  type: "session.upsert";
  patch: {
    schemaVersion?: number;
    status?: SessionDocument["status"];
    cursorScreen?: string | null;
    personName?: string | null;
    dateOfPassing?: string | null;
    lastOpenedAt?: number;
    deletedAt?: number | null;
    screens?: SessionDocument["screens"];
  };
  baseUpdatedAt: number;
  createdAt: number;
  attempts: number;
}

/** DATA.md §1's `sendJobs` store — ephemeral per-send delivery progress, never synced. */
export interface LocalSendJob {
  jobId: string;
  sessionId: string;
  recipients: { contactId: string; status: "queued" | "sending" | "delivered" | "failed" }[];
  createdAt: number;
}

export interface AccountRecord {
  key: "checklistTicks" | "senderName";
  value: string[] | string;
}

/**
 * `syncCursor`/`lastSyncAt` live here rather than in `localStorage` (DATA.md
 * §1's own suggestion) because the Service Worker needs to read and write
 * them too, and a Service Worker has no `localStorage` access at all — only
 * IndexedDB. `activeSessionId`/`userId` stay in `localStorage` since only the
 * main thread needs them, synchronously, at boot.
 *
 * `deviceId`/`devUserId`/`gatewayUrl` are here for the same reason: the
 * Service Worker (`apps/web/public/sw.js`) needs them to identify itself and
 * find the gateway when it wakes on a Background Sync event, and the main
 * thread is what writes them at boot (see `apps/web/src/lib/registerSync.ts`).
 */
export type MetaRecord =
  | { key: "schemaVersion" | "lastKnownServerTime" | "syncCursor" | "lastSyncAt"; value: number }
  | { key: "deviceId" | "devUserId" | "gatewayUrl"; value: string };

interface GGSchema extends DBSchema {
  sessions: {
    key: string; // sessionId
    value: SessionDocument;
    indexes: { byUpdatedAt: number; byStatus: string };
  };
  contacts: {
    key: string; // contactId
    value: Contact;
    indexes: { byTier: string; bySource: string };
  };
  outbox: {
    key: number; // opId, autoIncrement
    value: OutboxOp;
    indexes: { byCreatedAt: number; bySessionId: string };
  };
  sendJobs: {
    key: string; // jobId
    value: LocalSendJob;
    indexes: { bySessionId: string };
  };
  account: {
    key: string; // AccountRecord['key']
    value: AccountRecord;
  };
  meta: {
    key: string; // MetaRecord['key']
    value: MetaRecord;
  };
}

const DB_NAME = "gg";
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<GGSchema>> | null = null;

/**
 * Opens the `gg` IndexedDB database (DATA.md §1), one connection shared by
 * every store in this lib. Forward-only versioned upgrades — see
 * `migrations.ts` for what runs when `schemaVersion` (the app-level session
 * shape version, distinct from this IDB `DB_VERSION`) changes.
 */
export function openDb(): Promise<IDBPDatabase<GGSchema>> {
  if (!dbPromise) {
    dbPromise = openDB<GGSchema>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("sessions")) {
          const store = db.createObjectStore("sessions", { keyPath: "sessionId" });
          store.createIndex("byUpdatedAt", "updatedAt");
          store.createIndex("byStatus", "status");
        }
        if (!db.objectStoreNames.contains("contacts")) {
          const store = db.createObjectStore("contacts", { keyPath: "contactId" });
          store.createIndex("byTier", "tier");
          store.createIndex("bySource", "source");
        }
        if (!db.objectStoreNames.contains("outbox")) {
          const store = db.createObjectStore("outbox", {
            keyPath: "opId",
            autoIncrement: true,
          });
          store.createIndex("byCreatedAt", "createdAt");
          store.createIndex("bySessionId", "sessionId");
        }
        if (!db.objectStoreNames.contains("sendJobs")) {
          const store = db.createObjectStore("sendJobs", { keyPath: "jobId" });
          store.createIndex("bySessionId", "sessionId");
        }
        if (!db.objectStoreNames.contains("account")) {
          db.createObjectStore("account", { keyPath: "key" });
        }
        if (!db.objectStoreNames.contains("meta")) {
          db.createObjectStore("meta", { keyPath: "key" });
        }
      },
    });
  }
  return dbPromise;
}

/** Test-only: drop the cached connection so a fresh `openDb()` reopens (simulates a reload). */
export function _resetDbConnectionForTests(): void {
  dbPromise = null;
}

export type { GGSchema };
