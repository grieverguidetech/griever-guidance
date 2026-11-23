import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { ReactElement } from 'react';
import { RefreshControl } from 'react-native';
import type { RefreshControlProps } from 'react-native';
import { screenCopy } from '@griever/copy';
import { Status } from '../ui/Status';
import { canPullNow, pullNow, subscribeCanPullNow } from './requestFlowPull';

const copy = screenCopy('phoneHub');

export interface PullToRefresh {
  /** For the ScrollView's `refreshControl`. Undefined when sync is not allowed, so no pull is offered. */
  refreshControl: ReactElement<RefreshControlProps> | undefined;
  /** The failure line (a polite status node, announced when its text changes). Null when no pull is offered. */
  notice: ReactElement | null;
}

/** Pull to refresh for a screen's ScrollView: the spinner runs until the pull ends; a failure says so calmly. */
export function usePullToRefresh(id: string): PullToRefresh {
  const allowed = useSyncExternalStore(subscribeCanPullNow, canPullNow, canPullNow);
  const [refreshing, setRefreshing] = useState(false);
  const [failed, setFailed] = useState(false);
  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);

  const onRefresh = useCallback(async () => {
    setFailed(false);
    setRefreshing(true);
    const ok = await pullNow();
    if (live.current) {
      setFailed(!ok);
      setRefreshing(false);
    }
  }, []);

  if (!allowed) {
    return { refreshControl: undefined, notice: null };
  }
  return {
    refreshControl: <RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} />,
    notice: <Status id={id} message={failed ? copy.refreshFailed : undefined} />,
  };
}
