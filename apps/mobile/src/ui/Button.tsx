import { useCallback, useEffect } from 'react';
import type { ComponentRef, Ref } from 'react';
import type { GestureResponderEvent } from 'react-native';
import { AccessibilityInfo, ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { minTouchTarget, spacing, v2 } from '@griever/tokens';
import { applyAriaDisabled } from './ariaDisabled';
import { Phrasing } from './phrasing';
import { LinearSwirl } from './Swirl';
import { useSerifStyle } from './typography';

/** The element a button renders: a DOM node on web, a host instance on native. */
export type ButtonNode = ComponentRef<typeof Pressable>;

/**
 * Three tiers, chosen by what the button does (product owner, 2026-11-23):
 * - `primary` is an action: the v2 sunset LinearSwirl fill, radius, border, text and shadow from `v2.recipes.button.primary`.
 * - `secondary` is navigation (Back, Close, What you'll need's neighbours): the `v2.recipes.button.outline` recipe. The page shows
 *   through, a thin roles.link edge, roles.link text, no swirl and no shadow.
 * - `tertiary` is a suggestion: the `v2.recipes.button.tertiary` recipe. A roles.link label with an underline, no fill and
 *   no border, and a pale accent wash while pressed.
 * No icons. Palette and serif follow web.
 */
export type ButtonVariant = 'primary' | 'secondary' | 'tertiary';

const PRIMARY = v2.recipes.button.primary;
const OUTLINE = v2.recipes.button.outline;
const TERTIARY = v2.recipes.button.tertiary;
const PAGE = v2.roles.page.color;

/** The whole recipe shadow list as one boxShadow string. react-native-web 0.21 warns on the old shadow* props; RN 0.88 reads this natively. */
export function recipeShadow(recipe: typeof PRIMARY): string {
  return recipe.shadow.map(({ x, y, blur, color }) => `${x}px ${y}px ${blur}px ${color}`).join(', ');
}

/** The primary recipe's border, radius and shadow as one outer style. */
function primaryFrame() {
  return {
    borderWidth: PRIMARY.border.width,
    borderColor: PRIMARY.border.color,
    borderRadius: PRIMARY.radius,
    // Behind the swirl; only a sliver at the edge could show it, so the inner radius is radius - border.width.
    backgroundColor: PRIMARY.swirl.stops[0],
    boxShadow: recipeShadow(PRIMARY),
  };
}

/** The outline recipe's edge and radius: transparent fill, no shadow. */
const OUTLINE_FRAME = {
  borderWidth: OUTLINE.border.width,
  borderColor: OUTLINE.border.color,
  borderRadius: OUTLINE.radius,
} as const;

/** Pressed swirl buttons dim to this. At 0.7 the secondary label fell to about 3.6:1; 0.85 stays above 4.5:1 (see Button.spec). */
const SWIRL_PRESSED_OPACITY = 0.85;

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
   * While `busy`, the words shown instead of the label, for example "Reading your contacts…". They are
   * announced once when the work starts (iOS). A busy button shows a small spinner too. Native only: on web
   * a busy button looks and reads as it always did.
   */
  busyLabel?: string;
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
  /** A button that opens something in place: open or closed. Native: accessibilityState expanded. Leave unset for a plain button. */
  expanded?: boolean;
  /** Fires when a press starts, before onPress. For a caller that must know before a blur lands (web). */
  onPressIn?: () => void;
  /** Opt-in: a taller minimum for the button itself, in points (for example the bottom action bar's 52). */
  minHeight?: number;
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
  busyLabel,
  accessibilityName,
  announceDisabled = false,
  pressed,
  expanded,
  minHeight,
  onPressIn,
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

  // The busy look (spinner, busy words, aria-busy) is native only: web buttons stay as they were (#659).
  const showBusy = Boolean(busy) && Platform.OS !== 'web';
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
  if (expanded !== undefined) {
    extra['aria-expanded'] = expanded;
  }
  if (showBusy) {
    extra['aria-busy'] = true;
  }
  if (opensDialog) {
    extra['aria-haspopup'] = 'dialog';
  }

  // Weight by the typography helper: semibold (Nunito Sans 600) on every tier.
  const font = useSerifStyle('semibold');
  // Said once when the work starts. On native, a state change alone is not spoken.
  const working = showBusy;
  useEffect(() => {
    // Only with busyLabel: a screen that already announces its own busy text is left alone.
    // iOS only, like the other announcements here (iOS ignores the busy state change).
    if (working && busyLabel && Platform.OS === 'ios') {
      AccessibilityInfo.announceForAccessibility(busyLabel);
    }
    // Only when the work starts, not when the words change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [working]);
  const swirled = variant === 'primary' && !ariaDisabled;
  // An unavailable primary or secondary is quiet (matches web): no swirl, a flat page fill, a dashed recipe border, no shadow.
  const unavailableOutline = ariaDisabled && variant !== 'tertiary';
  // The recipe colour in every state: plain roles.muted would drop under 4.5:1 on the primary fill.
  const labelColor = LABEL_COLOR[variant];
  const text = (
    <Phrasing>
      <Text
        style={[
          styles.label,
          font,
          styles.labelSize,
          { color: labelColor },
          labelStyle(variant, ariaDisabled),
          variant === 'tertiary' && TERTIARY.underline && !ariaDisabled && styles.labelTertiary,
        ]}
      >
        {working && busyLabel ? busyLabel : label}
      </Text>
    </Phrasing>
  );
  const spinnerColor = labelColor;
  const body = working ? (
    <View style={styles.content}>
      <ActivityIndicator
        size="small"
        color={spinnerColor}
        importantForAccessibility="no-hide-descendants"
        accessibilityElementsHidden
      />
      {text}
    </View>
  ) : (
    text
  );
  return (
    <Pressable
      ref={setRef}
      role="button"
      accessibilityHint={hint}
      accessibilityState={buttonState(busy, ariaDisabled && announceDisabled, pressed, expanded)}
      onPress={onPress}
      onPressIn={onPressIn}
      style={({ pressed: touching }) => [
        styles.base,
        styles[variant],
        variant === 'primary' && primaryFrame(),
        variant === 'secondary' && OUTLINE_FRAME,
        swirled && styles.swirlFrame,
        unavailableOutline && styles.unavailableOutline,
        // A toggle that is on keeps the pressed wash, so on and off differ (secondary only; matches web).
        variant === 'secondary' && pressed === true && !ariaDisabled && styles.pressedWash,
        minHeight !== undefined && { minHeight },
        // No press fade while unavailable: opacity would drop the dashed edge under 3:1 (web skips it too).
        touching && !ariaDisabled && (variant === 'primary' ? styles.pressedSwirl : styles.pressedWash),
      ]}
      {...extra}
    >
      {swirled ? (
        <LinearSwirl stops={[...PRIMARY.swirl.stops]} angle={PRIMARY.swirl.angle} driftMs={PRIMARY.driftMs} style={[styles.swirl, { borderRadius: PRIMARY.radius - PRIMARY.border.width }]}>
          {body}
        </LinearSwirl>
      ) : (
        body
      )}
    </Pressable>
  );
}

/** Native only: unavailable reads as disabled. (On web aria-disabled is set on the node, see ariaDisabled.ts.) */
function buttonState(busy: boolean | undefined, ariaDisabled: boolean, pressed: boolean | undefined, expanded: boolean | undefined) {
  // On web a disabled state would also take the button out of the tab order, so only busy goes through.
  const unavailable = ariaDisabled && Platform.OS !== 'web';
  // On web a pressed toggle is aria-pressed (set above); `selected` would render aria-selected, which a button does not take.
  const selected = pressed !== undefined && Platform.OS !== 'web' ? pressed : undefined;
  // On web an expanded button is aria-expanded (set above), not a native state.
  const open = expanded !== undefined && Platform.OS !== 'web' ? expanded : undefined;
  if (busy === undefined && !unavailable && selected === undefined && open === undefined) {
    return undefined;
  }
  return {
    busy: busy ?? false,
    disabled: Boolean(busy) || unavailable,
    ...(selected === undefined ? {} : { selected }),
    ...(open === undefined ? {} : { expanded: open }),
  };
}

/** The label colour of each tier, from its recipe. */
const LABEL_COLOR: Record<ButtonVariant, string> = {
  primary: PRIMARY.text.color,
  secondary: OUTLINE.text.color,
  tertiary: TERTIARY.text.color,
};

/** An unavailable tertiary has no edge to go quiet with, so its label goes muted; the other tiers keep the recipe colour on a dashed edge. */
function labelStyle(variant: ButtonVariant, ariaDisabled: boolean) {
  return ariaDisabled && variant === 'tertiary' ? styles.labelUnavailable : undefined;
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
    borderRadius: OUTLINE.radius,
  },
  // Primary gets its fill, border and shadow from the primary recipe (primaryFrame); secondary its edge from the outline recipe.
  primary: { paddingVertical: 14 },
  secondary: { paddingVertical: 14 },
  // Text only. The 44px minimum still makes the target; paddingHorizontal keeps the wash off the text edge.
  tertiary: {},
  pressedSwirl: { opacity: SWIRL_PRESSED_OPACITY },
  // roles.link on roles.wash is above 4.5:1 (see Button.spec), so the label stays readable while pressed.
  pressedWash: { backgroundColor: v2.roles.wash },
  // Unavailable is a quiet look, not a fade: opacity would drop the label below 4.5:1 and the edge below 3:1.
  // Primary and secondary: flat page, dashed recipe border, recipe text. The rest: roles.muted text.
  unavailableOutline: { backgroundColor: PAGE, borderStyle: 'dashed', boxShadow: 'none' },
  // The swirl fills the frame and carries the padding, so the whole button is gradient. The first stop shows behind it for the shadow.
  swirlFrame: { paddingVertical: 0, paddingHorizontal: 0, alignItems: 'stretch' },
  swirl: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: spacing[3], paddingVertical: 14 },
  content: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing[1] },
  label: {
  },
  labelSize: { fontSize: 15 },
  labelTertiary: { textDecorationLine: 'underline' },
  labelUnavailable: { color: v2.roles.muted },
});
