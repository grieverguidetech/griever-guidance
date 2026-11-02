import { useCallback } from 'react';
import type { ComponentRef, Ref } from 'react';
import type { GestureResponderEvent } from 'react-native';
import { Platform, Pressable, StyleSheet, Text } from 'react-native';
import { colors, minTouchTarget, spacing } from '@griever/tokens';
import { applyAriaDisabled } from './ariaDisabled';
import { Phrasing } from './phrasing';
import { useSerifStyle } from './typography';

/** The element a button renders: a DOM node on web, a host instance on native. */
export type ButtonNode = ComponentRef<typeof Pressable>;

/**
 * Looks follow the mobile app's buttons (decision by Peter, 2026-10-25): rounded 10px corners,
 * a solid accent-700 primary, an accent outline for secondary, and a tinted outlined "link" button
 * (HomeScreen's What you'll need) as `tinted`, and `tertiary` for quiet actions such as Cancel: an
 * accent-700 label with an underline, no fill and no border, and a pale accent wash while pressed.
 * `header` is Back and What you'll need (#362): the page shows through, a thin accent-600 outline,
 * no underline, same as web's top bar. No icons. Palette and serif still follow web.
 */
export type ButtonVariant = 'primary' | 'secondary' | 'tinted' | 'ghost' | 'tertiary' | 'header';

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
  /** Web only: tells assistive tech the button opens a dialog. */
  opensDialog?: boolean;
  /**
   * Native: a request from this button is running. Reads as busy and unavailable
   * (`accessibilityState`); the caller ignores presses meanwhile. Leave unset for a plain button.
   */
  busy?: boolean;
  /**
   * With `ariaDisabled`, native also reads the button as disabled. Only for a button whose press does
   * nothing: native swallows the tap of a disabled button (#292), so a button that explains itself
   * on press (the paywall) must leave this off.
   */
  announceDisabled?: boolean;
  /** A fuller name when the label alone is not enough, for example "Select all, Close family". It must start with the label. */
  accessibilityName?: string;
  /** A toggle: on or off. Web: aria-pressed. Native: accessibilityState selected. Leave unset for a plain button. */
  pressed?: boolean;
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
  accessibilityName,
  announceDisabled = false,
  pressed,
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
  if (accessibilityName) {
    extra['aria-label'] = accessibilityName;
    extra['accessibilityLabel'] = accessibilityName;
  }
  if (pressed !== undefined) {
    extra['aria-pressed'] = pressed;
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
      accessibilityState={buttonState(busy, ariaDisabled && announceDisabled, pressed)}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        styles[variant],
        unavailableFill && styles.unavailableFill,
        pressed && (variant === 'tertiary' || variant === 'header' ? styles.pressedWash : styles.pressed),
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

/** Native only: unavailable reads as disabled. (On web aria-disabled is set on the node, see ariaDisabled.ts.) */
function buttonState(busy: boolean | undefined, ariaDisabled: boolean, pressed: boolean | undefined) {
  // On web a disabled state would also take the button out of the tab order, so only busy goes through.
  const unavailable = ariaDisabled && Platform.OS !== 'web';
  // On web a pressed toggle is aria-pressed (set above); `selected` would render aria-selected, which a button does not take.
  const selected = pressed !== undefined && Platform.OS !== 'web' ? pressed : undefined;
  if (busy === undefined && !unavailable && selected === undefined) {
    return undefined;
  }
  return { busy: busy ?? false, disabled: Boolean(busy) || unavailable, ...(selected === undefined ? {} : { selected }) };
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
  // accent-600 on the page is 3.74:1, above the 3:1 non-text minimum.
  header: { borderColor: colors['accent-600'] },
  pressed: { opacity: 0.7 },
  // accent-700 on accent-100 is above 4.5:1 (see Button.spec), so the label stays readable while pressed.
  pressedWash: { backgroundColor: colors['accent-100'] },
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
