import { useEffect } from 'react';
import { AppState } from 'react-native';
import type { AuthClient } from '@griever/api-client/auth';

/**
 * Token refresh runs only while the app is in the foreground (Supabase's React Native guidance:
 * timers are unreliable in the background). Device APIs stay in the app, not in the lib (§6).
 * Subscribes once per client and unsubscribes on unmount. With no client (flag off) it does nothing.
 */
export function useAutoRefreshWithAppState(client: AuthClient | null): void {
  useEffect(() => {
    if (!client) return;
    // supabase-js already starts its timer at creation, so only follow later changes, plus pause
    // now if the app is not active when this mounts.
    if (AppState.currentState !== 'active') void client.stopAutoRefresh();
    const subscription = AppState.addEventListener('change', (state) => {
      void (state === 'active' ? client.startAutoRefresh() : client.stopAutoRefresh());
    });
    return () => subscription.remove();
  }, [client]);
}
