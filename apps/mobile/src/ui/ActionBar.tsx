import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing } from '@griever/tokens';
import { Button } from './Button';
import { Body } from './Text';

/** The primary button is never shorter than this, in points (MOB-12). */
export const ACTION_BAR_BUTTON_HEIGHT = 52;

export interface ActionBarProps {
  /** The next thing, named: for example "Text 3 people". */
  label: string;
  onPress: () => void;
  /** A muted line under the button. */
  note?: string;
  /** Secondary links, shown above the button. */
  above?: ReactNode;
  /**
   * Set when the next step is not available yet. The button stays focusable, reads the reason as its
   * hint, shows it as the line under it, and a press does nothing.
   */
  disabledReason?: string;
}

/**
 * The bar fixed at the bottom of a phone screen. Put it after the scrolling content, outside it. Its
 * bottom padding includes the safe-area inset, so the button clears the home indicator.
 */
export function ActionBar({ label, onPress, note, above, disabledReason }: ActionBarProps) {
  const insets = useSafeAreaInsets();
  const disabled = Boolean(disabledReason);
  const line = disabled ? disabledReason : note;
  return (
    <View style={[styles.bar, { paddingBottom: insets.bottom + spacing[2] }]}>
      {above ? <View style={styles.above}>{above}</View> : null}
      <Button
        label={label}
        onPress={disabled ? noop : onPress}
        ariaDisabled={disabled}
        announceDisabled={disabled}
        hint={disabled ? disabledReason : undefined}
        minHeight={ACTION_BAR_BUTTON_HEIGHT}
      />
      {line ? (
        <View style={styles.line}>
          <Body small tone="muted">{line}</Body>
        </View>
      ) : null}
    </View>
  );
}

function noop() {
  // A disabled primary does nothing when pressed.
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: colors.bg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors['neutral-400'],
    paddingHorizontal: spacing[3],
    paddingTop: spacing[2],
    gap: spacing[2],
  },
  // Links wrap and keep a gap, so they do not run off screen at the largest text size (#654).
  above: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2], justifyContent: 'center' },
  line: { alignItems: 'center' },
});
