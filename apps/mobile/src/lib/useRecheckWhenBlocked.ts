import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { expoContactsSource } from './expoContactsSource';

/**
 * While contacts are refused for good, watch for the app coming back to the front (the person may have
 * turned contacts on in Settings). When the system would now allow a read or ask again, call `onAllowed`.
 */
export function useRecheckWhenBlocked(blocked: boolean, onAllowed: () => void) {
  const latest = useRef(onAllowed);
  latest.current = onAllowed;
  useEffect(() => {
    if (!blocked) {
      return undefined;
    }
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') {
        return;
      }
      expoContactsSource
        .isAvailable()
        .then((allowed) => {
          if (allowed) {
            latest.current();
          }
        })
        .catch(() => undefined);
    });
    return () => subscription.remove();
  }, [blocked]);
}
