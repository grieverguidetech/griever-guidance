import type { ReactNode, Ref } from 'react';
import type { GestureResponderEvent } from 'react-native';
import { Pressable, StyleSheet } from 'react-native';
import { minTouchTarget, spacing } from '@griever/tokens';
import { applyAriaDisabled } from './ariaDisabled';
import { Phrasing } from './phrasing';

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
  /** The row's node (a DOM node on web, a host instance on native), for returning focus to it. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rowRef?: Ref<any>;
}

/** A whole line that is one button, for example a step in a list. */
export function Row({ children, onPress, ariaDisabled = false, describedBy, hint, rowRef }: RowProps) {
  const extra: Record<string, unknown> = {};
  if (describedBy) {
    extra['aria-describedby'] = describedBy;
  }
  return (
    <Pressable
      ref={(node) => {
        applyAriaDisabled(node, ariaDisabled);
        if (typeof rowRef === 'function') {
          rowRef(node);
        } else if (rowRef) {
          (rowRef as { current: unknown }).current = node;
        }
      }}
      role="button"
      // No accessibility `disabled` state, even when aria-disabled: on native it swallows the tap.
      accessibilityHint={hint}
      onPress={onPress}
      style={styles.row}
      {...extra}
    >
      <Phrasing>{children}</Phrasing>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { minHeight: minTouchTarget, paddingVertical: spacing[2], gap: 2 },
});
