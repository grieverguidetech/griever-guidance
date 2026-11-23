import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
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
import { useReduceMotion } from '../lib/useReduceMotion';

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
 * Runs a looping animation while Reduce Motion is off. When it is on, or turns on later, the loop
 * stops and nothing starts. The animated value stays where it was.
 */
function useLoop(makeLoop: () => Animated.CompositeAnimation) {
  const reduceMotion = useReduceMotion();
  const makeRef = useRef(makeLoop);
  makeRef.current = makeLoop;
  useEffect(() => {
    if (reduceMotion) {
      return undefined;
    }
    const loop = makeRef.current();
    loop.start();
    return () => loop.stop();
  }, [reduceMotion]);
}

type LinearSwirlProps = {
  stops: string[];
  /** CSS-style angle in degrees: 0 points up, 90 points right. */
  angle: number;
  /** Time for one slide in one direction. */
  driftMs: number;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
};

/** Start and end points of the gradient line, as fractions of the box, for a CSS-style angle. */
function gradientLine(angle: number) {
  const rad = (angle * Math.PI) / 180;
  const dx = Math.sin(rad) / 2;
  const dy = -Math.cos(rad) / 2;
  return { x1: 0.5 - dx, y1: 0.5 - dy, x2: 0.5 + dx, y2: 0.5 + dy };
}

/** A colour gradient that slowly slides back and forth behind its children. */
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
  useLoop(() =>
    Animated.loop(
      Animated.sequence([
        Animated.timing(slide, {
          toValue: 1,
          duration: driftMs,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(slide, {
          toValue: 0,
          duration: driftMs,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    ),
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
    <View {...HIDDEN} onLayout={onLayout} style={[styles.fill, style]}>
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

/** The wedges of a conic gradient: one path and one colour each. */
export function conicWedges(stops: string[], size: number) {
  const centre = size / 2;
  const step = (Math.PI * 2) / CONIC_WEDGES;
  // Each wedge runs a hair past its slice so no seam shows between neighbours.
  const overlap = step * 0.04;
  return Array.from({ length: CONIC_WEDGES }, (_, i) => ({
    d: wedgePath(centre, centre, i * step, (i + 1) * step + overlap),
    fill: colorAround(stops, i / CONIC_WEDGES),
  }));
}

type ConicSwirlProps = {
  stops: string[];
  size: number;
  /** Time for one full turn. */
  spinMs: number;
};

/**
 * A conic (colour wheel) gradient that turns slowly. SVG has no conic gradient, so the circle is
 * drawn as many thin wedges, each one flat colour.
 */
export function ConicSwirl({ stops, size, spinMs }: ConicSwirlProps) {
  const id = useId();
  const turn = useRef(new Animated.Value(0)).current;
  useLoop(() =>
    Animated.loop(
      Animated.timing(turn, {
        toValue: 1,
        duration: spinMs,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    ),
  );
  const wedges = useMemo(() => conicWedges(stops, size), [stops, size]);
  const rotate = turn.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });
  const clipId = `swirl-clip-${id}`;
  return (
    <Animated.View
      {...HIDDEN}
      style={{ width: size, height: size, transform: [{ rotate }] }}
    >
      <Svg width={size} height={size}>
        <Defs>
          <ClipPath id={clipId}>
            <Circle cx={size / 2} cy={size / 2} r={size / 2} />
          </ClipPath>
        </Defs>
        {wedges.map((wedge, i) => (
          <Path
            key={i}
            d={wedge.d}
            fill={wedge.fill}
            clipPath={`url(#${clipId})`}
          />
        ))}
      </Svg>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  fill: { ...StyleSheet.absoluteFill, overflow: 'hidden' },
  slider: { position: 'absolute', top: 0, bottom: 0, left: 0 },
});
