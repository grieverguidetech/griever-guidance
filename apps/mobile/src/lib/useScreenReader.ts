import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';
import { useReduceMotion } from './useReduceMotion';

// What the phone last said. True until it answers, so a screen reader never meets a fade first.
let lastKnown = true;

/** Whether a screen reader (VoiceOver, TalkBack) is on, kept current. */
export function useScreenReader(): boolean {
  const [on, setOnState] = useState(lastKnown);
  useEffect(() => {
    let live = true;
    const setOn = (value: boolean) => {
      lastKnown = value;
      if (live) {
        setOnState(value);
      }
    };
    AccessibilityInfo.isScreenReaderEnabled()
      .then(setOn)
      .catch(() => undefined);
    const sub = AccessibilityInfo.addEventListener('screenReaderChanged', setOn);
    return () => {
      live = false;
      sub.remove();
    };
  }, []);
  return on;
}

/**
 * True when screens should appear at once with no fade: Reduce Motion is on, or a screen reader is
 * on (content at opacity 0 can lose the focus a screen sends to its heading on mount).
 */
export function useNoFade(): boolean {
  const reduce = useReduceMotion();
  const screenReader = useScreenReader();
  return reduce || screenReader;
}
