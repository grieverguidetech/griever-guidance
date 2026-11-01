import { useEffect, useRef } from 'react';

/** Where the user is in the editor. Small and serializable: it is stored in the history entry. */
export interface NavSpot {
  view: string;
  section: string;
  item: string | null;
  personId: string | null;
}

const KEY = 'ggNav';
/** How long an automatic Back may take to land before we decide the walk has stopped (the first entry of the tab). */
const AUTO_BACK_SETTLE_MS = 300;
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
 * state of ours; when Back lands on such an entry we go Back again, so one press walks past all of
 * them and leaves the app like a site with no sign-in. We never push from here.
 */
export function useNavHistory({ enabled, trackable, spot, userId, signedOut, onRestore }: Options): void {
  const recorded = useRef<string | null>(null);
  const generation = useRef('');
  const autoMoves = useRef(0);
  // True while the entry we are on is one of ours.
  const onOurs = useRef(false);
  // True from our own back() until it lands (or the settle timer says it has stopped).
  const autoBackPending = useRef(false);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
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
      onOurs.current = false;
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
    onOurs.current = true;
    autoMoves.current = 0;
  }, [enabled, trackable, view, section, item, personId, userId, signedOut]);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    function goBackAgain() {
      autoBackPending.current = true;
      clearTimeout(settleTimer.current);
      // No popstate in time means back() had nowhere to go: the walk has stopped.
      settleTimer.current = setTimeout(() => {
        autoBackPending.current = false;
      }, AUTO_BACK_SETTLE_MS);
      window.history.back();
    }

    /** An entry that is not a screen of ours: a sign-in step, or one from an earlier sign-in. */
    function onForeign() {
      if (autoMoves.current >= MAX_AUTO_MOVES) {
        return;
      }
      autoMoves.current += 1;
      if (autoBackPending.current || onOurs.current) {
        // We came from one of ours, or are already walking back: keep going back, past all of them.
        onOurs.current = false;
        goBackAgain();
        return;
      }
      // The user pressed Forward from an entry that is not ours: keep going forward, to the next screen of ours.
      window.history.forward();
    }

    function onPop(event: PopStateEvent) {
      clearTimeout(settleTimer.current);
      const target = readSpot(event.state, generation.current);
      const shown = target ? latest.current.onRestore(target) : false;
      if (!shown) {
        onForeign();
        return;
      }
      autoBackPending.current = false;
      autoMoves.current = 0;
      onOurs.current = true;
      recorded.current = JSON.stringify([shown.view, shown.section, shown.item, shown.personId]);
      if (target && recorded.current !== JSON.stringify([target.view, target.section, target.item, target.personId])) {
        // A fallback was shown: make this entry say so, without touching the entries after it.
        window.history.replaceState({ ...(window.history.state ?? {}), [KEY]: { ...shown, gen: generation.current } }, '');
      }
    }

    // Back from another page into this one (the back/forward cache): nothing says which entry we are on.
    function onPageShow(event: PageTransitionEvent) {
      if (event.persisted) {
        onOurs.current = false;
        autoBackPending.current = false;
      }
    }

    window.addEventListener('popstate', onPop);
    window.addEventListener('pageshow', onPageShow);
    return () => {
      clearTimeout(settleTimer.current);
      window.removeEventListener('popstate', onPop);
      window.removeEventListener('pageshow', onPageShow);
    };
  }, [enabled]);
}
