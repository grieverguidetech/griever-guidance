import { useCallback } from 'react';
import type { ComponentRef, Ref } from 'react';
import type { GestureResponderEvent } from 'react-native';
import { Pressable, StyleSheet, Text } from 'react-native';
import { colors, minTouchTarget, spacing } from '@griever/tokens';
import { applyAriaDisabled } from './ariaDisabled';
import { Phrasing } from './phrasing';
import { useSerifStyle } from './typography';

/** The element a button renders: a DOM node on web, a host instance on native. */
export type ButtonNode = ComponentRef<typeof Pressable>;

/**
 * Looks follow the mobile app's buttons (decision by Peter, 2026-10-25): rounded 10px corners,
 * a solid accent-700 primary, an accent outline for secondary, and a tinted outlined "link" button
 * (HomeScreen's What you'll need) as `tinted`, and `tertiary` for quiet actions such as Back: an
 * accent-700 label with an underline, no fill and no border, and a pale accent wash while pressed. No icons. Palette and serif still follow web.
 */
export type ButtonVariant = 'primary' | 'secondary' | 'tinted' | 'ghost' | 'tertiary';

const BUTTON_RADIUS = 10;

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
  /** `tertiary` only: adds a thin accent-600 outline (3.74:1 on the page), for a quiet button that still needs to read as a button. */
  outlined?: boolean;
  /** Web only: tells assistive tech the button opens a dialog. */
  opensDialog?: boolean;
  /**
   * Native: a request from this button is running. Reads as busy and unavailable
   * (`accessibilityState`); the caller ignores presses meanwhile. Leave unset for a plain button.
   */
  busy?: boolean;
  buttonRef?: Ref<ButtonNode>;
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  ariaDisabled = false,
  describedBy,
  hint,
  opensDialog = false,
  busy,
  outlined = false,
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

  const font = useSerifStyle('semibold');
  const unavailableFill = ariaDisabled && variant === 'primary';
  return (
    <Pressable
      ref={setRef}
      role="button"
      accessibilityHint={hint}
      accessibilityState={busy === undefined ? undefined : { busy, disabled: busy }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        styles[variant],
        unavailableFill && styles.unavailableFill,
        variant === 'tertiary' && outlined && styles.outline,
        pressed && (variant === 'tertiary' ? styles.pressedTertiary : styles.pressed),
      ]}
      {...extra}
    >
      <Phrasing>
        <Text style={[styles.label, font, variant === 'primary' ? styles.labelPrimary : styles.labelLink, labelStyle(variant, ariaDisabled), variant === 'tertiary' && styles.labelTertiary]}>
          {label}
        </Text>
      </Phrasing>
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
    borderRadius: BUTTON_RADIUS,
  },
  // Fills behind text use accent-700 (5.72:1 with the page colour); the base accent is decorative.
  primary: { backgroundColor: colors['accent-700'], paddingVertical: 14 },
  // Outlined with the accent, as mobile's secondary button. accent-700 on the page is 5.72:1.
  secondary: { borderColor: colors['accent-700'], paddingVertical: 14 },
  tinted: { borderColor: colors['accent-700'], backgroundColor: colors['accent-100'] },
  ghost: {},
  // Text only. The 44px minimum still makes the target; paddingHorizontal keeps the wash off the text edge.
  tertiary: {},
  outline: { borderColor: colors['accent-600'] },
  pressed: { opacity: 0.7 },
  // accent-700 on accent-100 is above 4.5:1 (see Button.spec), so the label stays readable while pressed.
  pressedTertiary: { backgroundColor: colors['accent-100'] },
  // Unavailable is a solid muted look, not a fade: opacity would drop the label below 4.5:1.
  // Primary: bg on neutral-700 (see Button.spec for the numbers). Others: neutral-700 text on the page.
  unavailableFill: { backgroundColor: colors['neutral-700'] },
  label: {
  },
  labelPrimary: { fontSize: 15 },
  labelLink: { fontSize: 14 },
  labelOnFill: { color: colors.bg },
  labelTertiary: { textDecorationLine: 'underline' },
  labelAccent: { color: colors['accent-700'] },
  labelUnavailable: { color: colors['neutral-700'] },
});
