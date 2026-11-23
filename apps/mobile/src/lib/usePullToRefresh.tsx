import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { ReactElement } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';
import type { RefreshControlProps } from 'react-native';
import { screenCopy } from '@griever/copy';
import { Status } from '../ui/Status';
import { canPullNow, onPullSucceeded, pullNow, subscribeCanPullNow } from './requestFlowPull';

const copy = screenCopy('phoneRefresh');

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
  // Any pull that works, automatic or manual, makes the line out of date.
  useEffect(() => onPullSucceeded(() => setFailed(false)), []);

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
    // The live-region node stays mounted so a change is announced. While empty it is out of the layout, so it adds no gap.
    notice: (
      <View testID={`${id}-holder`} style={failed ? undefined : styles.hidden}>
        <Status id={id} message={failed ? copy.failed : undefined} queue />
      </View>
    ),
  };
}

const styles = StyleSheet.create({
  hidden: { position: 'absolute', width: 0, height: 0, overflow: 'hidden' },
});
