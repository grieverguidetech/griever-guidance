import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { Animated, AppState, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { v2 } from '@griever/tokens';
import { PageGlow } from '../ui/PageGlow';
import { FADE_MS } from '../lib/useReduceMotion';
import { useNoFade } from '../lib/useScreenReader';

/**
 * The one safe-area rule for every screen: the page colour fills the whole display, and the content
 * clears the status bar at the top and the home indicator at the bottom. Screens add no inset padding
 * of their own.
 */
export function ScreenFrame({ children, bottomInset = true }: { children: ReactNode; /** Off when the screen's own bottom bar pads by the inset (the hub's ActionBar). */ bottomInset?: boolean }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, paddingTop: insets.top, paddingBottom: bottomInset ? insets.bottom : 0, backgroundColor: v2.roles.page.color }}>
      <PageGlow />
      {children}
    </View>
  );
}

/** Past the fade's own length, a fade that has not reported back is cut short and the screen is shown. */
const FADE_SAFETY_MS = 300;

/**
 * Fades a screen in when it first shows (the top-level screens are swapped in place, not pushed on
 * a stack). Shows at once, with no animation, when Reduce Motion or a screen reader is on. Opacity only; nothing moves (C7). It paints the page colour only; ScreenFrame draws the glow.
 */
export function FadeIn({ children }: { children: ReactNode }) {
  const reduce = useNoFade();
  const opacity = useRef(new Animated.Value(reduce ? 1 : 0)).current;
  const played = useRef(false);
  const done = useRef(false);
  useEffect(() => {
    if (reduce) {
      done.current = true;
      opacity.setValue(1);
      return;
    }
    if (played.current) {
      return;
    }
    played.current = true;
    // The screen must never stay invisible (#1073): an interrupted fade, or one that never reports back
    // (the native screen was detached), still ends fully shown.
    const show = () => {
      done.current = true;
      opacity.setValue(1);
    };
    Animated.timing(opacity, { toValue: 1, duration: FADE_MS, useNativeDriver: true }).start(({ finished }) => {
      if (finished) {
        done.current = true;
      } else {
        show();
      }
    });
    const timer = setTimeout(() => {
      if (!done.current) {
        show();
      }
    }, FADE_MS + FADE_SAFETY_MS);
    // Coming back from another app (the Messages hand-off) with the fade unfinished shows the screen at once.
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active' && !done.current) {
        show();
      }
    });
    return () => {
      clearTimeout(timer);
      subscription.remove();
    };
  }, [reduce, opacity]);
  return (
    <Animated.View style={{ flex: 1, backgroundColor: v2.roles.page.color, opacity }}>
      {children}
    </Animated.View>
  );
}
