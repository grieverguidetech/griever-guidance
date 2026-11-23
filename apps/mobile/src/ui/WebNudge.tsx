import { StyleSheet, Text, View } from 'react-native';
import { spacing, v2 } from '@griever/tokens';
import { Button } from './Button';
import { ConicSwirl, LinearSwirl } from './Swirl';
import { useSerifStyle } from './typography';

export interface WebNudgeProps {
  /** The words, already chosen for the step (libs/copy/screens/phoneNudge.json). */
  title: string;
  line: string;
  button: string;
  onGotIt: () => void;
}

const recipe = v2.recipes.nudge;
const SWIRL_STOPS = [...recipe.swirl.stops];
const ORB_STOPS = [...recipe.orb.conic];

/** The recipe shadows in RN's boxShadow form, as Card and Button do. */
const shadow = recipe.shadow.map((s) => ({
  offsetX: s.x,
  offsetY: s.y,
  blurRadius: s.blur,
  color: s.color,
}));

/**
 * Where the speckles sit, as fractions of the card. They stay in the card's padding (the right
 * edge and the top and bottom edges), so they never sit behind the words.
 */
const SPECKLES = [
  { right: 5, top: '14%' },
  { right: 9, top: '58%' },
  { right: 4, top: '86%' },
  { right: '38%', top: 4 },
  { right: '70%', top: 5 },
  { right: '22%', bottom: 4 },
  { right: '62%', bottom: 5 },
] as const;
const SPECKLE_SIZE = 5;

const HIDDEN = {
  accessible: false,
  accessibilityElementsHidden: true,
  importantForAccessibility: 'no-hide-descendants',
} as const;

/**
 * A step with nothing written on the web yet. The v2 nudge recipe: a pastel swirl that settles,
 * faint speckles, a small colour-wheel orb, one thin border and two tight shadows. Not one
 * accessible block: a screen reader reads the heading, the line and the button one by one, after the
 * screen's own heading (which takes focus on arrival). Do not add accessible or accessibilityLabel
 * to the card: it would hide the button. The swirl, speckles and orb are decoration, hidden.
 */
export function WebNudge({ title, line, button, onGotIt }: WebNudgeProps) {
  const headingFont = useSerifStyle('semibold');
  const bodyFont = useSerifStyle('regular');
  return (
    <View testID="web-nudge" style={styles.card}>
      <View style={styles.clip}>
        <LinearSwirl
          stops={SWIRL_STOPS}
          angle={recipe.swirl.angle}
          driftMs={recipe.driftMs}
          testID="nudge-swirl"
          style={StyleSheet.absoluteFill}
        />
        <View
          {...HIDDEN}
          pointerEvents="none"
          testID="nudge-speckles"
          style={StyleSheet.absoluteFill}
        >
          {SPECKLES.map((spot, i) => (
            <View
              key={i}
              style={[
                styles.speckle,
                spot,
                {
                  backgroundColor:
                    recipe.speckles.colors[i % recipe.speckles.colors.length],
                  opacity: recipe.speckles.alpha,
                },
              ]}
            />
          ))}
        </View>
        <View style={styles.row}>
          <View style={styles.orb}>
            <ConicSwirl
              stops={ORB_STOPS}
              size={recipe.orb.size}
              spinMs={v2.primitives.motion.spinMs}
              testID="nudge-orb"
            />
          </View>
          <View style={styles.words}>
            <Text
              role="heading"
              aria-level={2}
              accessibilityRole="header"
              style={[styles.heading, headingFont]}
            >
              {title}
            </Text>
            <Text style={[styles.line, bodyFont]}>{line}</Text>
          </View>
        </View>
        <Button label={button} variant="primary" onPress={onGotIt} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // The shadow and border live here; clipping is on the inner view so Android does not cut the shadow.
  card: {
    borderWidth: recipe.border.width,
    borderColor: recipe.border.color,
    borderRadius: recipe.radius,
    boxShadow: shadow,
  },
  clip: {
    gap: spacing[3],
    padding: spacing[4],
    overflow: 'hidden',
    borderRadius: Math.max(0, recipe.radius - recipe.border.width),
  },
  row: { flexDirection: 'row', gap: spacing[2], alignItems: 'flex-start' },
  orb: { paddingTop: 1 },
  words: { flex: 1, gap: spacing[1] },
  heading: {
    color: recipe.text.color,
    fontSize: recipe.text.size,
    lineHeight: 22,
  },
  line: {
    color: recipe.text.color,
    fontSize: recipe.text.size,
    lineHeight: 22,
  },
  speckle: {
    position: 'absolute',
    width: SPECKLE_SIZE,
    height: SPECKLE_SIZE,
    borderRadius: SPECKLE_SIZE / 2,
  },
});
