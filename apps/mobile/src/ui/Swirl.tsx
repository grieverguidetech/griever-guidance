import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, View } from 'react-native';
import type { LayoutChangeEvent, StyleProp, ViewStyle } from 'react-native';
import Svg, {
  ClipPath,
  Circle,
  Defs,
  LinearGradient,
  Path,
  Rect,
  Stop,
} from 'react-native-svg';

/** Props that hide a decoration from screen readers. */
const HIDDEN = {
  accessible: false,
  accessibilityElementsHidden: true,
  importantForAccessibility: 'no-hide-descendants',
} as const;

/** How many wedges make the circle. More looks smoother; 24 is enough at button sizes. */
export const CONIC_WEDGES = 24;
/** The gradient rect is this wide compared with the box, so there is room to drift. */
const DRIFT_WIDTH = 2.2;

/**
 * How long a swirl moves after it mounts. Then it rests. WCAG 2.2.2 allows motion up to 5 seconds
 * without a pause control; 4500 ms leaves headroom for the time before the first frame.
 */
export const SETTLE_MS = 4500;

/**
 * Runs one pass of motion when the swirl mounts and is `ready`, then leaves it at rest where it
 * ended. `makePass` returns null for "no motion". With Reduce Motion on nothing runs, and turning
 * it on mid-pass stops the pass where it is. Once a pass has started it never runs again for this
 * mount, so a change of settings stays calm.
 */
function useSettle(
  ready: boolean,
  makePass: () => Animated.CompositeAnimation | null,
) {
  const makeRef = useRef(makePass);
  makeRef.current = makePass;
  const readyRef = useRef(ready);
  readyRef.current = ready;
  // Calm until the phone answers, as useReduceMotion is. Kept in refs, not state: the answer arrives
  // from a promise, and a state update there lands outside React's act scope (a warning in tests, and a
  // wasted render in the app). Nothing is drawn from the answer; it only decides whether a pass starts.
  const reduceRef = useRef(true);
  const passRef = useRef<Animated.CompositeAnimation | null>(null);
  // Under StrictMode's double effect the swirl would not move in dev; the app does not use StrictMode.
  const started = useRef(false);
  const tryStart = useRef(() => {
    if (reduceRef.current || !readyRef.current || started.current) {
      return;
    }
    const pass = makeRef.current();
    if (!pass) {
      return;
    }
    started.current = true;
    passRef.current = pass;
    pass.start();
  }).current;
  useEffect(() => {
    let live = true;
    const setReduce = (on: boolean) => {
      if (!live) {
        return;
      }
      reduceRef.current = on;
      if (on) {
        passRef.current?.stop();
      } else {
        tryStart();
      }
    };
    AccessibilityInfo.isReduceMotionEnabled()
      .then(setReduce)
      .catch(() => undefined);
    const sub = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReduce,
    );
    return () => {
      live = false;
      sub.remove();
      passRef.current?.stop();
    };
  }, [tryStart]);
  useEffect(() => {
    tryStart();
  }, [ready, tryStart]);
}

type LinearSwirlProps = {
  /** 3- or 6-digit hex colours only (for example #fff or #ffffff). */
  stops: string[];
  /** Degrees, 0 points up and 90 points right, in the box's own units. Approximate for angles that are not multiples of 90. */
  angle: number;
  /** Time for one full slide: sets the speed. */
  driftMs: number;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
};

/** Start and end points of the gradient line, as fractions of the box. */
function gradientLine(angle: number) {
  const rad = (angle * Math.PI) / 180;
  const dx = Math.sin(rad) / 2;
  const dy = -Math.cos(rad) / 2;
  return { x1: 0.5 - dx, y1: 0.5 - dy, x2: 0.5 + dx, y2: 0.5 + dy };
}

/**
 * A colour gradient that slides behind its children for about 5 seconds, then rests. The children stay
 * readable: only the decoration layer is hidden from screen readers.
 */
export function LinearSwirl({
  stops,
  angle,
  driftMs,
  style,
  children,
}: LinearSwirlProps) {
  const id = useId();
  const [width, setWidth] = useState(0);
  const slide = useRef(new Animated.Value(0)).current;
  // driftMs is the time for one full slide, so one pass covers SETTLE_MS / driftMs of it (at most all).
  // It waits for the real width, so the native interpolation has its true range.
  useSettle(width > 0, () =>
    driftMs > 0
      ? Animated.timing(slide, {
          toValue: Math.min(1, SETTLE_MS / driftMs),
          duration: SETTLE_MS,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        })
      : null,
  );
  const onLayout = (event: LayoutChangeEvent) =>
    setWidth(event.nativeEvent.layout.width);
  const translateX = slide.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -width * (DRIFT_WIDTH - 1)],
  });
  const line = gradientLine(angle);
  const gradientId = `swirl-${id}`;
  return (
    <View onLayout={onLayout} style={[styles.outer, style]}>
      <View
        {...HIDDEN}
        pointerEvents="none"
        testID="linear-swirl-decoration"
        style={styles.decoration}
      >
        <Animated.View
          style={[
            styles.slider,
            { width: `${DRIFT_WIDTH * 100}%`, transform: [{ translateX }] },
          ]}
        >
          <Svg width="100%" height="100%">
            <Defs>
              <LinearGradient id={gradientId} {...line}>
                {stops.map((color, i) => (
                  <Stop
                    key={i}
                    offset={stops.length > 1 ? i / (stops.length - 1) : 0}
                    stopColor={color}
                  />
                ))}
              </LinearGradient>
            </Defs>
            <Rect
              x="0"
              y="0"
              width="100%"
              height="100%"
              fill={`url(#${gradientId})`}
            />
          </Svg>
        </Animated.View>
      </View>
      {children}
    </View>
  );
}

type Rgb = [number, number, number];

/** Reads #rgb or #rrggbb. Returns null for anything else. */
function parseHex(color: string): Rgb | null {
  const hex = color.replace('#', '');
  const full = hex.length === 3 ? hex.replace(/./g, '$&$&') : hex;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) {
    return null;
  }
  return [0, 2, 4].map((at) => parseInt(full.slice(at, at + 2), 16)) as Rgb;
}

function toHex(rgb: Rgb): string {
  return `#${rgb.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
}

/** The colour at `t` (0 to 1) around the stops, with the last stop blending back into the first. */
export function colorAround(stops: string[], t: number): string {
  const count = stops.length;
  const spot = t * count;
  const from = stops[Math.floor(spot) % count];
  const to = stops[(Math.floor(spot) + 1) % count];
  const a = parseHex(from);
  const b = parseHex(to);
  if (!a || !b) {
    return from;
  }
  const mix = spot - Math.floor(spot);
  return toHex([0, 1, 2].map((k) => a[k] + (b[k] - a[k]) * mix) as Rgb);
}

/** One slice of the circle, as an SVG path from the centre. */
function wedgePath(
  centre: number,
  radius: number,
  from: number,
  to: number,
): string {
  const point = (a: number) =>
    `${centre + radius * Math.cos(a)} ${centre + radius * Math.sin(a)}`;
  return `M${centre} ${centre}L${point(from)}A${radius} ${radius} 0 0 1 ${point(to)}Z`;
}

/** The wedges of a conic gradient: one path and one colour each. Wedge 0 starts at 12 o'clock. */
export function conicWedges(stops: string[], size: number) {
  const centre = size / 2;
  const step = (Math.PI * 2) / CONIC_WEDGES;
  const top = -Math.PI / 2;
  // Each wedge runs a hair past its slice so no seam shows between neighbours.
  const overlap = step * 0.04;
  return Array.from({ length: CONIC_WEDGES }, (_, i) => ({
    d: wedgePath(
      centre,
      centre,
      top + i * step,
      top + (i + 1) * step + overlap,
    ),
    // The middle of the slice, so the colours are balanced round the wheel.
    fill: colorAround(stops, (i + 0.5) / CONIC_WEDGES),
  }));
}

type ConicSwirlProps = {
  /** 3- or 6-digit hex colours only (for example #fff or #ffffff). */
  stops: string[];
  size: number;
  /** Time for one full turn: sets the speed. */
  spinMs: number;
  testID?: string;
};

/**
 * A conic (colour wheel) gradient that turns for about 5 seconds, then rests. SVG has no conic gradient, so the circle is
 * drawn as many thin wedges, each one flat colour. With no stops it draws nothing.
 */
export function ConicSwirl({ stops, size, spinMs, testID }: ConicSwirlProps) {
  const turn = useRef(new Animated.Value(0)).current;
  // spinMs is the time for one full turn. One pass turns SETTLE_MS / spinMs of a turn, at most one
  // whole turn (a faster speed would only spin past where it can be followed).
  useSettle(true, () =>
    spinMs > 0
      ? Animated.timing(turn, {
          toValue: SETTLE_MS / Math.max(spinMs, SETTLE_MS),
          duration: SETTLE_MS,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        })
      : null,
  );
  const wedges = useMemo(
    () => (stops.length === 0 ? [] : conicWedges(stops, size)),
    [stops, size],
  );
  const rotate = turn.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });
  return (
    <Animated.View
      {...HIDDEN}
      pointerEvents="none"
      testID={testID}
      style={{ width: size, height: size, transform: [{ rotate }] }}
    >
      <Svg width={size} height={size}>
        {wedges.map((wedge, i) => (
          <Path key={i} d={wedge.d} fill={wedge.fill} />
        ))}
      </Svg>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  outer: { overflow: 'hidden' },
  decoration: { ...StyleSheet.absoluteFill, overflow: 'hidden' },
  slider: { position: 'absolute', top: 0, bottom: 0, left: 0 },
});
