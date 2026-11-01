import { useEffect, useRef } from 'react';

/** Where the user is in the editor. Small and serializable: it is stored in the history entry. */
export interface NavSpot {
  view: string;
  section: string;
  item: string | null;
  personId: string | null;
}

const KEY = 'ggNav';
/** Marks an entry below our first one that the walk has been on, with how far below it is. */
const WALK_KEY = 'ggWalk';
/** Most automatic extra moves in a row, so an odd history can never loop. */
const MAX_AUTO_MOVES = 50;

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

/** How far below our first entry a marked entry is (-1, -2, ...), or null when it is not marked by this sign-in. */
function readWalkPos(state: unknown, gen: string): number | null {
  if (typeof state !== 'object' || state === null) {
    return null;
  }
  const raw = (state as Record<string, unknown>)[WALK_KEY];
  if (typeof raw !== 'object' || raw === null) {
    return null;
  }
  const { gen: entryGen, pos } = raw as Record<string, unknown>;
  return entryGen === gen && typeof pos === 'number' && Number.isInteger(pos) && pos < 0 ? pos : null;
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
  /**
   * Called when Back or Forward lands on an entry this hook made. Returns the spot it actually showed
   * (the same one, or a fallback such as Your people when the person is gone), or false to refuse it.
   * A refused entry is treated like one that is not ours.
   */
  onRestore: (spot: NavSpot) => NavSpot | false;
}

/**
 * Gives in-app moves their own history entries so Back walks through them. The first screen replaces
 * the current entry (the sign-in one). Clerk's hash routing leaves one entry per sign-in step, with no
 * state of ours. When Back lands on such an entry from one of ours we go Back again, so one press walks
 * past all of them and leaves the app like a site with no sign-in. Each entry the walk lands on is marked
 * in place with how far below our first entry it is; a later pop to a marked entry is a Back when it is
 * lower than where we were and a Forward when it is higher, so a slow or repeated pop cannot be mistaken
 * for the other direction. An entry not yet marked can only be met on the first pass, which always comes
 * from our own entries, so it counts as Back. We never push from here.
 */
export function useNavHistory({ enabled, trackable, spot, userId, signedOut, onRestore }: Options): void {
  const recorded = useRef<string | null>(null);
  const generation = useRef('');
  const autoMoves = useRef(0);
  // Where the entry we are on sits below our first entry: 0 on ours, then -1, -2, ...
  const pos = useRef(0);
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
      pos.current = 0;
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
    pos.current = 0;
    autoMoves.current = 0;
  }, [enabled, trackable, view, section, item, personId, userId, signedOut]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    /** An entry that is not a screen of ours: a sign-in step, or one from an earlier sign-in. */
    function onForeign(state: unknown) {
      if (autoMoves.current >= MAX_AUTO_MOVES) {
        return;
      }
      autoMoves.current += 1;
      const marked = readWalkPos(state, generation.current);
      if (marked !== null && marked > pos.current) {
        // Higher than where we were: the user pressed Forward. Keep going, to the next screen of ours.
        pos.current = marked;
        window.history.forward();
        return;
      }
      // Lower, or not marked yet (only met on the first pass, which starts on one of ours): Back.
      const next = marked ?? pos.current - 1;
      pos.current = next;
      if (marked === null) {
        window.history.replaceState({ ...(window.history.state ?? {}), [WALK_KEY]: { gen: generation.current, pos: next } }, '');
      }
      window.history.back();
    }

    function onPop(event: PopStateEvent) {
      const target = readSpot(event.state, generation.current);
      const shown = target ? latest.current.onRestore(target) : false;
      if (!shown) {
        onForeign(event.state);
        return;
      }
      autoMoves.current = 0;
      pos.current = 0;
      recorded.current = JSON.stringify([shown.view, shown.section, shown.item, shown.personId]);
      if (target && recorded.current !== JSON.stringify([target.view, target.section, target.item, target.personId])) {
        // A fallback was shown: make this entry say so, without touching the entries after it.
        window.history.replaceState({ ...(window.history.state ?? {}), [KEY]: { ...shown, gen: generation.current } }, '');
      }
    }

    // Back from another page into this one (the back/forward cache): the entry we are on tells where we are.
    function onPageShow(event: PageTransitionEvent) {
      if (event.persisted) {
        const state = window.history.state;
        pos.current = readSpot(state, generation.current) !== null ? 0 : (readWalkPos(state, generation.current) ?? 0);
      }
    }

    window.addEventListener('popstate', onPop);
    window.addEventListener('pageshow', onPageShow);
    return () => {
      window.removeEventListener('popstate', onPop);
      window.removeEventListener('pageshow', onPageShow);
    };
  }, [enabled]);
}
