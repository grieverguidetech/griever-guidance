import { StyleSheet, View } from 'react-native';
import { colors, radius, spacing } from '@griever/tokens';
import { Button } from './Button';
import { Heading } from './Heading';
import { Body } from './Text';

export interface WebNudgeProps {
  /** The words, already chosen for the step (libs/copy/screens/phoneNudge.json). */
  title: string;
  line: string;
  button: string;
  onGotIt: () => void;
}

/**
 * A step with nothing written on the web yet. Same look as the web PhoneNudge card: pale accent
 * background, ink text, one line, one primary button. It is a summary region, so a screen reader
 * announces it once when the screen opens (the screen's own heading takes focus first).
 */
export function WebNudge({ title, line, button, onGotIt }: WebNudgeProps) {
  return (
    <View style={styles.card} accessibilityRole="summary">
      <Heading level={2}>{title}</Heading>
      <Body>{line}</Body>
      <Button label={button} variant="primary" onPress={onGotIt} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing[2],
    padding: spacing[4],
    backgroundColor: colors['accent-100'],
    borderRadius: radius.lg,
    // Subtle on purpose: there are no shadow tokens.
    shadowColor: colors.ink,
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
});
