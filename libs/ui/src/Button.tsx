import { useCallback } from 'react';
import type { ComponentRef, Ref } from 'react';
import type { GestureResponderEvent } from 'react-native';
import { Platform, Pressable, StyleSheet, Text } from 'react-native';
import { colors, minTouchTarget, radius, spacing } from '@griever/tokens';
import { serifFamily, serifWeight } from './typography';

/** The element a button renders: a DOM node on web, a host instance on native. */
export type ButtonNode = ComponentRef<typeof Pressable>;

export type ButtonVariant = 'primary' | 'secondary' | 'ghost';

export interface ButtonProps {
  label: string;
  onPress: (event: GestureResponderEvent) => void;
  variant?: ButtonVariant;
  /**
   * Looks and reads as unavailable (`aria-disabled`) but stays focusable and still calls `onPress`,
   * so the caller can explain why, for example with the paywall placeholder on a locked step.
   */
  ariaDisabled?: boolean;
  /** Web: the id of an element that explains the unavailable state (aria-describedby). */
  describedBy?: string;
  /** Native: the reason, read after the label (accessibilityHint), for example "Included with the full plan". */
  hint?: string;
  /** Web only: tells assistive tech the button opens a dialog. */
  opensDialog?: boolean;
  buttonRef?: Ref<ButtonNode>;
}

/**
 * react-native-web's Pressable drops `aria-disabled` and only supports a real `disabled`, which
 * removes the button from the tab order. For an unavailable-but-focusable button the attribute is
 * set on the DOM node here. Native uses the accessibility state instead.
 */
/** The two DOM methods used below, so this lib needs no DOM typings. */
interface DomAttributes {
  setAttribute: (name: string, value: string) => void;
  removeAttribute: (name: string) => void;
}

/**
 * react-native-web's Pressable drops `aria-disabled` and only supports a real `disabled`, which
 * removes the button from the tab order. For an unavailable-but-focusable button the attribute is
 * set on the DOM node in the ref callback, so it is applied every time the node attaches (first
 * render, remount) and whenever `ariaDisabled` changes. Native uses the accessibility state.
 */
function applyAriaDisabled(node: ButtonNode | null, ariaDisabled: boolean) {
  if (Platform.OS !== 'web' || !node) {
    return;
  }
  const element = node as unknown as DomAttributes;
  if (ariaDisabled) {
    element.setAttribute('aria-disabled', 'true');
  } else {
    element.removeAttribute('aria-disabled');
  }
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  ariaDisabled = false,
  describedBy,
  hint,
  opensDialog = false,
  buttonRef,
}: ButtonProps) {
  const setRef = useCallback(
    (node: ButtonNode | null) => {
      applyAriaDisabled(node, ariaDisabled);
      if (typeof buttonRef === 'function') {
        buttonRef(node);
      } else if (buttonRef) {
        (buttonRef as { current: ButtonNode | null }).current = node;
      }
    },
    [ariaDisabled, buttonRef],
  );

  const extra: Record<string, unknown> = {};
  if (describedBy) {
    extra['aria-describedby'] = describedBy;
  }
  if (opensDialog) {
    extra['aria-haspopup'] = 'dialog';
  }

  const unavailableFill = ariaDisabled && variant === 'primary';
  return (
    <Pressable
      ref={setRef}
      role="button"
      accessibilityState={{ disabled: ariaDisabled }}
      accessibilityHint={hint}
      onPress={onPress}
      style={[styles.base, styles[variant], unavailableFill && styles.unavailableFill]}
      {...extra}
    >
      <Text style={[styles.label, labelStyle(variant, ariaDisabled)]}>{label}</Text>
    </Pressable>
  );
}

function labelStyle(variant: ButtonVariant, ariaDisabled: boolean) {
  if (ariaDisabled) {
    return variant === 'primary' ? styles.labelOnFill : styles.labelUnavailable;
  }
  return variant === 'primary' ? styles.labelOnFill : styles.labelAccent;
}

const styles = StyleSheet.create({
  base: {
    minHeight: minTouchTarget,
    minWidth: minTouchTarget,
    paddingHorizontal: spacing[3],
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
    borderRadius: radius.md,
  },
  // Fills behind text use accent-700 (5.72:1 with the page colour); the base accent is decorative.
  primary: { backgroundColor: colors['accent-700'] },
  secondary: { borderColor: colors['neutral-600'] },
  ghost: {},
  // Unavailable is a solid muted look, not a fade: opacity would drop the label below 4.5:1.
  // Primary: bg on neutral-700 (see Button.spec for the numbers). Others: neutral-700 text on the page.
  unavailableFill: { backgroundColor: colors['neutral-700'] },
  label: {
    fontFamily: serifFamily('semibold'),
    fontWeight: serifWeight('semibold'),
    fontSize: 14,
  },
  labelOnFill: { color: colors.bg },
  labelAccent: { color: colors['accent-700'] },
  labelUnavailable: { color: colors['neutral-700'] },
});
