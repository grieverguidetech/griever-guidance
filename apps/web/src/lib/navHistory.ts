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

const GEN_KEY = 'gg.navGen.v1';

function newToken(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * The token for this signed-in user in this tab. It survives a reload, so Back still walks the user's own
 * earlier screens; another user gets a new one. If storage throws, each load gets its own token.
 */
function tokenFor(userId: string): string {
  try {
    const saved = JSON.parse(window.sessionStorage.getItem(GEN_KEY) ?? 'null') as { userId?: unknown; gen?: unknown } | null;
    if (saved && saved.userId === userId && isString(saved.gen)) {
      return saved.gen;
    }
    const gen = newToken();
    window.sessionStorage.setItem(GEN_KEY, JSON.stringify({ userId, gen }));
    return gen;
  } catch {
    return newToken();
  }
}

function forgetToken(): void {
  try {
    window.sessionStorage.removeItem(GEN_KEY);
  } catch {
    // Nothing to forget.
  }
}

interface Options {
  /** True while someone is signed in (or there is no sign-in). Off, nothing is recorded. */
  enabled: boolean;
  /** False for screens that are not part of the walk (the old flows); they add no entries. */
  trackable: boolean;
  spot: NavSpot;
  /** The signed-in user's id ('' with no sign-in). The same user keeps their entries across a reload. */
  userId: string;
  /** True after a sign-out: the next sign-in, even by the same user, starts with new entries. */
  signedOut: boolean;
  /** Called when Back or Forward lands on an entry this hook made. */
  onRestore: (spot: NavSpot) => void;
}

/**
 * Gives in-app moves their own history entries so Back walks through them. The first screen replaces
 * the current entry (the sign-in one). Clerk's hash routing leaves one entry per sign-in step, with no
 * state of ours; when Back lands on such an entry we go Back again, so one press walks past all of
 * them and leaves the app like a site with no sign-in. We never push from here.
 */
export function useNavHistory({ enabled, trackable, spot, userId, signedOut, onRestore }: Options): void {
  const recorded = useRef<string | null>(null);
  const generation = useRef('');
  const autoBacks = useRef(0);
  const latest = useRef({ onRestore });
  latest.current = { onRestore };
  const { view, section, item, personId } = spot;

  useEffect(() => {
    if (signedOut) {
      forgetToken();
    }
    if (!enabled) {
      recorded.current = null;
      generation.current = '';
      return;
    }
    if (generation.current === '') {
      generation.current = tokenFor(userId);
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
  }, [enabled, trackable, view, section, item, personId, userId, signedOut]);

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
