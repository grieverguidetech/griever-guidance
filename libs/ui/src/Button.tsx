import { useCallback } from 'react';
import type { ComponentRef, Ref } from 'react';
import type { GestureResponderEvent, TextStyle } from 'react-native';
import { Platform, Pressable, StyleSheet, Text } from 'react-native';
import { minTouchTarget, spacing, v2 } from '@griever/tokens';
import { applyAriaDisabled } from './ariaDisabled';
import { Phrasing } from './phrasing';
import { useSerifStyle } from './typography';

/** The element a button renders: a DOM node on web, a host instance on native. */
export type ButtonNode = ComponentRef<typeof Pressable>;

/**
 * Three tiers, chosen by what the button does (product owner, 2026-11-23):
 * `primary` is an action (the sunset swirl), `secondary` is navigation (an outline: transparent, a 1px
 * roles.link edge, roles.link text) and `tertiary` is a suggestion (roles.link text with an underline,
 * no fill or edge). On web, apps/web/src/styles.css draws all three, found through data-gg-btn.
 * No icons. Palette and serif still follow web.
 */
export type ButtonVariant = 'primary' | 'secondary' | 'tertiary';

const BUTTON_RADIUS = 10;

// react-native-web passes 'inherit' through; the native types only allow numbers and fixed weights.
const WEB_INHERIT_FONT = { fontWeight: 'inherit', fontSize: 'inherit' } as unknown as TextStyle;

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
  // On web every tier takes its look from apps/web/src/styles.css, found through data-gg-btn.
  const swirl = Platform.OS === 'web';
  const unavailableFill = ariaDisabled && variant === 'primary' && !swirl;
  return (
    <Pressable
      ref={setRef}
      role="button"
      accessibilityHint={hint}
      accessibilityState={buttonState(busy, ariaDisabled && announceDisabled, pressed)}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        !swirl && styles.v1Edge,
        swirl ? styles.swirl : styles[variant],
        unavailableFill && styles.unavailableFill,
        pressed && !swirl && (variant === 'tertiary' ? styles.pressedWash : styles.pressed),
      ]}
      {...(swirl ? { dataSet: { ggBtn: variant } } : {})}
      {...extra}
    >
      <Phrasing>
        <Text style={[styles.label, font, variant === 'primary' ? styles.labelPrimary : styles.labelLink, swirl ? styles.labelSwirl : labelStyle(variant, ariaDisabled), variant === 'tertiary' && styles.labelTertiary]}>
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
  },
  // The v1 outline and corners. Web swirl buttons leave them out: styles.css draws the edge and radius.
  v1Edge: { borderWidth: 1, borderColor: 'transparent', borderRadius: BUTTON_RADIUS },
  // Web swirl: padding stays here because react-native-web zeroes it.
  swirl: { paddingVertical: 14 },
  // Fills behind text use the v2 link colour (see Button.spec for the contrast with the page colour).
  primary: { backgroundColor: v2.roles.link, paddingVertical: 14 },
  // Outlined with the link colour, as mobile's header button.
  secondary: { borderColor: v2.roles.link, paddingVertical: 14 },
  // Text only. The 44px minimum still makes the target; paddingHorizontal keeps the wash off the text edge.
  tertiary: {},
  pressed: { opacity: 0.7 },
  // link on wash is above 4.5:1 (see Button.spec), so the label stays readable while pressed.
  pressedWash: { backgroundColor: v2.roles.wash },
  // Unavailable is a solid muted look, not a fade: opacity would drop the label below 4.5:1.
  // Primary: page colour on muted (see Button.spec for the numbers). Others: muted text on the page.
  unavailableFill: { backgroundColor: v2.roles.muted },
  label: {
  },
  labelPrimary: { fontSize: 15 },
  labelLink: { fontSize: 14 },
  labelOnFill: { color: v2.roles.page.color },
  // Web swirl: the label takes the button's own text colour and font (family, weight, size) from styles.css.
  labelSwirl: { color: 'inherit', fontFamily: 'inherit', ...WEB_INHERIT_FONT },
  labelTertiary: { textDecorationLine: 'underline' },
  labelAccent: { color: v2.roles.link },
  labelUnavailable: { color: v2.roles.muted },
});
