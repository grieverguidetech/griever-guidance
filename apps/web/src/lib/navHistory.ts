import { useEffect, useRef } from 'react';

/** Where the user is in the editor. Small and serializable: it is stored in the history entry. */
export interface NavSpot {
  view: string;
  section: string;
  item: string | null;
  personId: string | null;
}

const KEY = 'ggNav';

function readSpot(state: unknown): NavSpot | null {
  if (typeof state !== 'object' || state === null) {
    return null;
  }
  const spot = (state as Record<string, unknown>)[KEY];
  if (typeof spot !== 'object' || spot === null) {
    return null;
  }
  const { view, section, item, personId } = spot as Record<string, unknown>;
  if (typeof view !== 'string' || typeof section !== 'string') {
    return null;
  }
  return {
    view,
    section,
    item: typeof item === 'string' ? item : null,
    personId: typeof personId === 'string' ? personId : null,
  };
}

interface Options {
  /** True while someone is signed in (or there is no sign-in). Off, nothing is recorded. */
  enabled: boolean;
  /** False for screens that are not part of the walk (the old flows); they add no entries. */
  trackable: boolean;
  spot: NavSpot;
  /** Called when Back or Forward lands on an entry this hook made. */
  onRestore: (spot: NavSpot) => void;
}

/**
 * Gives in-app moves their own history entries so Back walks through them, and keeps Back from ever
 * reaching what came before sign-in: the first screen replaces the current entry (the sign-in one), and
 * a Back past our entries is undone by pushing the current spot again.
 */
export function useNavHistory({ enabled, trackable, spot, onRestore }: Options): void {
  const recorded = useRef<string | null>(null);
  const latest = useRef({ spot, onRestore });
  latest.current = { spot, onRestore };
  const { view, section, item, personId } = spot;

  useEffect(() => {
    if (!enabled) {
      recorded.current = null;
      return;
    }
    if (!trackable) {
      return;
    }
    const key = JSON.stringify([view, section, item, personId]);
    if (recorded.current === key) {
      return;
    }
    const state = { ...(window.history.state ?? {}), [KEY]: { view, section, item, personId } };
    if (recorded.current === null) {
      window.history.replaceState(state, '');
    } else {
      window.history.pushState(state, '');
    }
    recorded.current = key;
  }, [enabled, trackable, view, section, item, personId]);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    function onPop(event: PopStateEvent) {
      const target = readSpot(event.state);
      if (!target) {
        // Back went past our entries, to the sign-in. Stay where we are.
        window.history.pushState({ [KEY]: latest.current.spot }, '');
        return;
      }
      recorded.current = JSON.stringify([target.view, target.section, target.item, target.personId]);
      latest.current.onRestore(target);
    }
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [enabled]);
}
