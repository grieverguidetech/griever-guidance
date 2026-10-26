import { useEffect, useRef } from 'react';
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
  /** Names an element that explains the unavailable state. */
  describedBy?: string;
  /** Tells assistive tech the button opens a dialog. */
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

function useAriaDisabledOnWeb(nodeRef: { current: ButtonNode | null }, ariaDisabled: boolean) {
  useEffect(() => {
    if (Platform.OS !== 'web' || !nodeRef.current) {
      return;
    }
    const element = nodeRef.current as unknown as DomAttributes;
    if (ariaDisabled) {
      element.setAttribute('aria-disabled', 'true');
    } else {
      element.removeAttribute('aria-disabled');
    }
  }, [nodeRef, ariaDisabled]);
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  ariaDisabled = false,
  describedBy,
  opensDialog = false,
  buttonRef,
}: ButtonProps) {
  const ownRef = useRef<ButtonNode | null>(null);
  useAriaDisabledOnWeb(ownRef, ariaDisabled);

  const setRef = (node: ButtonNode | null) => {
    ownRef.current = node;
    if (typeof buttonRef === 'function') {
      buttonRef(node);
    } else if (buttonRef) {
      (buttonRef as { current: ButtonNode | null }).current = node;
    }
  };

  const extra: Record<string, unknown> = {};
  if (describedBy) {
    extra['aria-describedby'] = describedBy;
  }
  if (opensDialog) {
    extra['aria-haspopup'] = 'dialog';
  }

  return (
    <Pressable
      ref={setRef}
      role="button"
      accessibilityState={{ disabled: ariaDisabled }}
      onPress={onPress}
      style={[styles.base, styles[variant], ariaDisabled && styles.unavailable]}
      {...extra}
    >
      <Text style={[styles.label, variant === 'primary' ? styles.labelOnFill : styles.labelAccent]}>{label}</Text>
    </Pressable>
  );
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
  unavailable: { opacity: 0.45 },
  label: {
    fontFamily: serifFamily('semibold'),
    fontWeight: serifWeight('semibold'),
    fontSize: 14,
  },
  labelOnFill: { color: colors.bg },
  labelAccent: { color: colors['accent-700'] },
});
