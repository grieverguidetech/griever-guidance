import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { flowQueueKey, FLOW_QUEUE_STORAGE_KEY, useFlowSync } from '@griever/hooks';
import type { SendFlowStorage, UseSessionsResult, Session } from '@griever/hooks';
import { useSyncAuth } from './AccountProvider';
import { createDeviceCache } from './deviceCache';
import { AUTH_ENABLED, SYNC_ENABLED } from './features';
import { onLeftFamily } from './leftFamily';
import { announcePullSucceeded, onFlowPullRequest, registerManualPull } from './requestFlowPull';

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
  /** Gives a person a new flowId when their old one was taken on the server (#942). */
  moveFlowId: UseSessionsResult['moveFlowId'];
  /** The device cache `useSessions` runs over. */
  storage: SendFlowStorage;
}

/**
 * Starts background sync (useFlowSync) on the phone. Nothing shows on screen (C5). It runs only
 * when sign-in is on, sync is on, and someone is signed in; otherwise no request is made.
 */
export function useMobileFlowSync({ sessions, applyRemoteFlows, moveFlowId, storage }: UseMobileFlowSyncOptions): void {
  const auth = useSyncAuth();
  const userId = auth?.status === 'signed_in' ? (auth.userId ?? '') : '';
  const allowed = AUTH_ENABLED && SYNC_ENABLED && userId !== '';

  // Read this account's saved queue before the first cycle, so edits made before a restart are kept.
  // Keyed to the cache object, not the user id, so a new account waits for its own cache to be read.
  const [readyQueue, setReadyQueue] = useState<SendFlowStorage | null>(null);
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
        setReadyQueue(queue);
      }
    });
    return () => {
      live = false;
    };
  }, [queue]);

  const joined = useMemo(() => (queue ? joinStorage(storage, queue) : storage), [storage, queue]);
  const getAccessToken = auth?.getToken;

  // The wake listeners the sync registers, so a pull can be asked for at once (after leaving a family, #224).
  const wakers = useRef(new Set<() => void>());
  const subscribe = useCallback((onWake: () => void) => {
    const stop = subscribeAppActive(onWake);
    wakers.current.add(onWake);
    return () => {
      wakers.current.delete(onWake);
      stop();
    };
  }, []);

  // After a member leaves: the shared people go from the device now, whether or not the pull that follows works.
  // Only for the signed-in account that left; applyRemoteFlows with no flows removes shared people and nothing else.
  useEffect(() => {
    if (userId === '') {
      return;
    }
    return onLeftFamily((leftUserId) => {
      if (leftUserId !== userId) {
        return;
      }
      applyRemoteFlows({ flows: [] }, userId);
      for (const wake of [...wakers.current]) {
        wake();
      }
    });
  }, [userId, applyRemoteFlows]);

  // A send screen opened: pull now, so the web's Ready status is current (#949). Only while sync is allowed.
  useEffect(() => {
    if (!allowed) {
      return;
    }
    return onFlowPullRequest(() => {
      for (const wake of [...wakers.current]) {
        wake();
      }
    });
  }, [allowed]);

  // Sync runs, and so a pull can be waited for, only once this account's saved queue has been read.
  const running = allowed && queue !== null && readyQueue === queue;
  const { pullNow, pullCount, flushNow } = useFlowSync({
    sessions,
    userId,
    enabled: running,
    getAccessToken: getAccessToken ?? (async () => null),
    storage: joined,
    subscribe,
    applyRemoteFlows,
    moveFlowId,
  });

  // Lets a screen pull to refresh and wait for the result (#959). Offered only while sync runs.
  useEffect(() => {
    if (!running) {
      return;
    }
    return registerManualPull(pullNow);
  }, [running, pullNow]);

  // Leaving the app: send the queue now instead of after the 1 second edit wait. iOS may suspend the app
  // before the request ends. The queue is saved on the device, so the worst case is that it goes out
  // the next time the app is in the foreground.
  useEffect(() => {
    if (!running) {
      return;
    }
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'background' || state === 'inactive') {
        flushNow();
      }
    });
    return () => subscription.remove();
  }, [running, flushNow]);

  // Any applied pull clears an old "could not load" line.
  useEffect(() => {
    if (pullCount > 0) {
      announcePullSucceeded();
    }
  }, [pullCount]);
}
