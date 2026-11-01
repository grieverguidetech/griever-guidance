import { useEffect, useRef } from 'react';

/** Where the user is in the editor. Small and serializable: it is stored in the history entry. */
export interface NavSpot {
  view: string;
  section: string;
  item: string | null;
  personId: string | null;
}

const KEY = 'ggNav';
/** Most automatic extra Backs in a row, so an odd history can never loop. */
const MAX_AUTO_BACKS = 50;

interface Stored extends NavSpot {
  /** Which sign-in wrote the entry; entries from an earlier sign-in in this tab are not ours any more. */
  gen: string;
}

function isString(value: unknown): value is string {
  return typeof value === 'string' && value !== '';
}

/** The spot in a history state, or null when the entry is not one of ours (or is malformed). */
function readSpot(state: unknown, gen: string): NavSpot | null {
  if (typeof state !== 'object' || state === null) {
    return null;
  }
  const raw = (state as Record<string, unknown>)[KEY];
  if (typeof raw !== 'object' || raw === null) {
    return null;
  }
  const { view, section, item, personId, gen: entryGen } = raw as Record<string, unknown>;
  if (!isString(view) || !isString(section) || entryGen !== gen) {
    return null;
  }
  if ((item !== null && !isString(item)) || (personId !== null && !isString(personId))) {
    return null;
  }
  return { view, section, item: item ?? null, personId: personId ?? null };
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
 * Gives in-app moves their own history entries so Back walks through them. The first screen replaces
 * the current entry (the sign-in one). Clerk's hash routing leaves one entry per sign-in step, with no
 * state of ours; when Back lands on such an entry we go Back again, so one press walks past all of
 * them and leaves the app like a site with no sign-in. We never push from here.
 */
export function useNavHistory({ enabled, trackable, spot, onRestore }: Options): void {
  const recorded = useRef<string | null>(null);
  const generation = useRef('');
  const autoBacks = useRef(0);
  const latest = useRef({ onRestore });
  latest.current = { onRestore };
  const { view, section, item, personId } = spot;

  useEffect(() => {
    if (!enabled) {
      recorded.current = null;
      generation.current = '';
      return;
    }
    if (generation.current === '') {
      generation.current = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    }
    if (!trackable) {
      return;
    }
    const key = JSON.stringify([view, section, item, personId]);
    if (recorded.current === key) {
      return;
    }
    const stored: Stored = { view, section, item, personId, gen: generation.current };
    const state = { ...(window.history.state ?? {}), [KEY]: stored };
    if (recorded.current === null) {
      window.history.replaceState(state, '');
    } else {
      window.history.pushState(state, '');
    }
    recorded.current = key;
    autoBacks.current = 0;
  }, [enabled, trackable, view, section, item, personId]);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    function onPop(event: PopStateEvent) {
      const target = readSpot(event.state, generation.current);
      if (!target) {
        // A sign-in step, or an entry from an earlier sign-in: not a screen. Keep walking back.
        if (autoBacks.current < MAX_AUTO_BACKS) {
          autoBacks.current += 1;
          window.history.back();
        }
        return;
      }
      autoBacks.current = 0;
      recorded.current = JSON.stringify([target.view, target.section, target.item, target.personId]);
      latest.current.onRestore(target);
    }
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [enabled]);
}
