import type { ReactNode } from 'react';
import type { GestureResponderEvent } from 'react-native';
import { Pressable, StyleSheet } from 'react-native';
import { minTouchTarget, spacing } from '@griever/tokens';
import { applyAriaDisabled } from './ariaDisabled';

export interface RowProps {
  /** The row's words. Its accessible name is the text inside. */
  children: ReactNode;
  onPress: (event: GestureResponderEvent) => void;
  /** Reads as unavailable but stays focusable and still calls `onPress` (see Button). */
  ariaDisabled?: boolean;
  /** Web: id of the element that gives the reason. */
  describedBy?: string;
  /** Native: the reason, read after the name. */
  hint?: string;
}

/** A whole line that is one button, for example a step in a list. */
export function Row({ children, onPress, ariaDisabled = false, describedBy, hint }: RowProps) {
  const extra: Record<string, unknown> = {};
  if (describedBy) {
    extra['aria-describedby'] = describedBy;
  }
  return (
    <Pressable
      ref={(node) => applyAriaDisabled(node, ariaDisabled)}
      role="button"
      accessibilityState={{ disabled: ariaDisabled }}
      accessibilityHint={hint}
      onPress={onPress}
      style={styles.row}
      {...extra}
    >
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { minHeight: minTouchTarget, paddingVertical: spacing[2], gap: 2 },
});
