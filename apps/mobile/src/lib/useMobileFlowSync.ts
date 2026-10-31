import { useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';
import { flowQueueKey, FLOW_QUEUE_STORAGE_KEY, useFlowSync } from '@griever/hooks';
import type { SendFlowStorage, UseSessionsResult, Session } from '@griever/hooks';
import { useSyncAuth } from './AccountProvider';
import { createDeviceCache } from './deviceCache';
import { AUTH_ENABLED, SYNC_ENABLED } from './features';

/** The phone's wake source: the app coming back to the foreground. Returns the unsubscribe. */
export function subscribeAppActive(onWake: () => void): () => void {
  const subscription = AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      onWake();
    }
  });
  return () => subscription.remove();
}

/**
 * The sync queue is kept per account under its own key. The session cache only loads the keys it
 * is told about at start, so the queue gets a small cache of its own, read once per account.
 * Every other key goes to the session cache.
 */
function joinStorage(base: SendFlowStorage, queue: SendFlowStorage): SendFlowStorage {
  const isQueue = (key: string) => key.startsWith(FLOW_QUEUE_STORAGE_KEY);
  return {
    getItem: (key) => (isQueue(key) ? queue.getItem(key) : base.getItem(key)),
    setItem: (key, value) => (isQueue(key) ? queue.setItem(key, value) : base.setItem(key, value)),
    removeItem: (key) => (isQueue(key) ? queue.removeItem(key) : base.removeItem(key)),
  };
}

export interface UseMobileFlowSyncOptions {
  sessions: readonly Session[];
  applyRemoteFlows: UseSessionsResult['applyRemoteFlows'];
  /** The device cache `useSessions` runs over. */
  storage: SendFlowStorage;
}

/**
 * Starts background sync (useFlowSync) on the phone. Nothing shows on screen (C5). It runs only
 * when sign-in is on, sync is on, and someone is signed in; otherwise no request is made.
 */
export function useMobileFlowSync({ sessions, applyRemoteFlows, storage }: UseMobileFlowSyncOptions): void {
  const auth = useSyncAuth();
  const userId = auth?.status === 'signed_in' ? (auth.userId ?? '') : '';
  const allowed = AUTH_ENABLED && SYNC_ENABLED && userId !== '';

  // Read this account's saved queue before the first cycle, so edits made before a restart are kept.
  const [readyFor, setReadyFor] = useState<string | null>(null);
  const queue = useMemo(
    () => (allowed ? createDeviceCache([{ key: flowQueueKey(userId), json: true }]) : null),
    [allowed, userId],
  );
  useEffect(() => {
    if (!queue) {
      return;
    }
    let live = true;
    void queue.hydrate().then(() => {
      if (live) {
        setReadyFor(userId);
      }
    });
    return () => {
      live = false;
    };
  }, [queue, userId]);

  const joined = useMemo(() => (queue ? joinStorage(storage, queue) : storage), [storage, queue]);
  const getAccessToken = auth?.getToken;
  useFlowSync({
    sessions,
    userId,
    enabled: allowed && readyFor === userId,
    getAccessToken: getAccessToken ?? (async () => null),
    storage: joined,
    subscribe: subscribeAppActive,
    applyRemoteFlows,
  });
}
