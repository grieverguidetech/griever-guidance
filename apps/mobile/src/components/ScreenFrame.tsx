import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { Animated, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '@griever/tokens';
import { FADE_MS } from '../lib/useReduceMotion';
import { useNoFade } from '../lib/useScreenReader';

/**
 * The one safe-area rule for every screen: the page colour fills the whole display, and the content
 * clears the status bar at the top and the home indicator at the bottom. Screens add no inset padding
 * of their own.
 */
export function ScreenFrame({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  return <View style={{ flex: 1, paddingTop: insets.top, paddingBottom: insets.bottom, backgroundColor: colors.bg }}>{children}</View>;
}

/**
 * Fades a screen in when it first shows (the top-level screens are swapped in place, not pushed on
 * a stack). Shows at once, with no animation, when Reduce Motion or a screen reader is on. Opacity only; nothing moves (C7).
 */
export function FadeIn({ children }: { children: ReactNode }) {
  const reduce = useNoFade();
  const opacity = useRef(new Animated.Value(reduce ? 1 : 0)).current;
  const played = useRef(false);
  useEffect(() => {
    if (reduce) {
      opacity.setValue(1);
      return;
    }
    if (played.current) {
      return;
    }
    played.current = true;
    Animated.timing(opacity, { toValue: 1, duration: FADE_MS, useNativeDriver: true }).start();
  }, [reduce, opacity]);
  return <Animated.View style={{ flex: 1, backgroundColor: colors.bg, opacity }}>{children}</Animated.View>;
}
