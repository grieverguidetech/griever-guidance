import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/** The one screen change: a calm fade, 200 ms or less. No slides (C7). */
export const FADE_MS = 200;

/**
 * Options for a native stack screen change. With Reduce Motion on there is no animation at all.
 * `animationDuration` is honoured on iOS only; Android uses its own short system fade.
 */
export const screenTransition = (reduceMotion: boolean) =>
  reduceMotion ? ({ animation: 'none' } as const) : ({ animation: 'fade', animationDuration: FADE_MS } as const);

// What the phone last said. True until it answers, so a person who asked for less motion never sees
// a fade first; screens shown later start with the real answer.
let lastKnown = true;

/** Whether the person asked the phone to reduce motion, kept current. */
export function useReduceMotion(): boolean {
  const [reduce, setReduceState] = useState(lastKnown);
  useEffect(() => {
    let live = true;
    const setReduce = (on: boolean) => {
      lastKnown = on;
      if (live) {
        setReduceState(on);
      }
    };
    AccessibilityInfo.isReduceMotionEnabled()
      .then(setReduce)
      .catch(() => undefined);
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduce);
    return () => {
      live = false;
      sub.remove();
    };
  }, []);
  return reduce;
}
