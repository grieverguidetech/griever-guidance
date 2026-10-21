import { useCallback, useEffect, useState } from 'react';
import type { SendFlowStorage } from './useSendFlow.js';

/** Under the `gg.` prefix, so "Remove everything from this device" clears it. */
export const INTRO_SEEN_KEY = 'gg.introSeen.v1';

type IntroStorage = SendFlowStorage | null | undefined;

/** Writes the flag. Never throws: a failed write only means the intro may show once more. */
export function markIntroSeen(storage: IntroStorage): void {
  try {
    storage?.setItem(INTRO_SEEN_KEY, '1');
  } catch {
    // Ignore: the intro is optional, the person's data is not touched.
  }
}

/**
 * Fails toward "seen": missing or broken storage must never put the intro
 * in front of someone who already has people.
 */
function readShouldShow(storage: IntroStorage, hasPeople: boolean): boolean {
  if (!storage) return false;
  try {
    if (storage.getItem(INTRO_SEEN_KEY) !== null) return false;
  } catch {
    return false;
  }
  return !hasPeople;
}

export interface FirstVisitIntro {
  /** True on the first visit only. Fixed for the life of the component until `dismiss`. */
  showIntro: boolean;
  /** The screen calls this when the person leaves the intro. */
  dismiss: () => void;
  /** Saves the flag again, for example after "Remove everything from this device". */
  markSeen: () => void;
}

/**
 * Decides once, on first render, whether to show the intro, and saves the flag
 * right away so a reload does not show it again. Pass `hasPeople` only after
 * people have loaded, or an existing user may see the intro.
 */
export function useFirstVisitIntro(storage: IntroStorage, hasPeople: boolean): FirstVisitIntro {
  const [showIntro, setShowIntro] = useState(() => readShouldShow(storage, hasPeople));

  // Written in an effect, not the initializer, so React Strict Mode's double
  // initializer call cannot flip the answer.
  useEffect(() => {
    markIntroSeen(storage);
  }, [storage]);

  const dismiss = useCallback(() => setShowIntro(false), []);
  const markSeen = useCallback(() => markIntroSeen(storage), [storage]);

  return { showIntro, dismiss, markSeen };
}
