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
 * `primary` and `secondary` are the v2 swirl buttons (#976): a sunset or soft ocean LinearSwirl fill, radius, border,
 * text and shadow from `v2.recipes.button`. The other variants keep the 2026-10-25 look (decision by Peter): rounded 10px corners, and a tinted outlined "link" button
 * (HomeScreen's What you'll need) as `tinted`, and `tertiary` for quiet actions such as Cancel: an
 * roles.link label with an underline, no fill and no border, and a pale accent wash while pressed.
 * `header` is Back and What you'll need (#362): the page shows through, a thin v2 focus-colour outline,
 * no underline, same as web's top bar. No icons. Palette and serif still follow web.
 */
export type ButtonVariant = 'primary' | 'secondary' | 'tinted' | 'ghost' | 'tertiary' | 'header';

const BUTTON_RADIUS = 10;

/** Primary and secondary are the v2 swirl buttons: a sliding gradient fill, drawn from the recipes. */
const RECIPES = { primary: v2.recipes.button.primary, secondary: v2.recipes.button.secondary } as const;
const PAGE = v2.roles.page.color;

type Recipe = (typeof RECIPES)[keyof typeof RECIPES];

/** The whole recipe shadow list as one boxShadow string. react-native-web 0.21 warns on the old shadow* props; RN 0.88 reads this natively. */
export function recipeShadow(recipe: Recipe): string {
  return recipe.shadow.map(({ x, y, blur, color }) => `${x}px ${y}px ${blur}px ${color}`).join(', ');
}

/** The recipe's border, radius and shadow as one outer style. */
function recipeFrame(recipe: Recipe) {
  return {
    borderWidth: recipe.border.width,
    borderColor: recipe.border.color,
    borderRadius: recipe.radius,
    // Behind the swirl; only a sliver at the edge could show it, so the inner radius is recipe.radius - border.width.
    backgroundColor: recipe.swirl.stops[0],
    boxShadow: recipeShadow(recipe),
  };
}

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

  // Weight by the typography helper: the regular face for secondary, semibold (Sora 500 once #972 lands) for the rest.
  const font = useSerifStyle(variant === 'secondary' ? 'regular' : 'semibold');
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
  const recipe = recipeOf(variant);
  const swirled = recipe !== undefined && !ariaDisabled;
  // An unavailable primary or secondary is quiet (matches web): no swirl, a flat page fill, a dashed recipe border, no shadow.
  const unavailableOutline = ariaDisabled && recipe !== undefined;
  // The recipe colour in every state: plain roles.muted was under 4.5:1 on the soft ocean swirl.
  const labelColor = recipe?.text.color;
  const text = (
    <Phrasing>
      <Text
        style={[
          styles.label,
          font,
          variant === 'primary' ? styles.labelPrimary : styles.labelLink,
          labelStyle(variant, ariaDisabled),
          (variant === 'tertiary' || variant === 'ghost') && styles.labelTertiary,
          labelColor !== undefined && { color: labelColor },
        ]}
      >
        {working && busyLabel ? busyLabel : label}
      </Text>
    </Phrasing>
  );
  const spinnerColor = labelColor ?? v2.roles.link;
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
      style={({ pressed }) => [
        styles.base,
        styles[variant],
        recipe && recipeFrame(recipe),
        swirled && styles.swirlFrame,
        unavailableOutline && styles.unavailableOutline,
        minHeight !== undefined && { minHeight },
        // No press fade while unavailable: opacity would drop the dashed edge under 3:1 (web skips it too).
        pressed && !ariaDisabled && (variant === 'tertiary' || variant === 'header' ? styles.pressedWash : recipe ? styles.pressedSwirl : styles.pressed),
      ]}
      {...extra}
    >
      {swirled ? (
        <LinearSwirl stops={[...recipe.swirl.stops]} angle={recipe.swirl.angle} driftMs={recipe.driftMs} style={[styles.swirl, { borderRadius: recipe.radius - recipe.border.width }]}>
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

function recipeOf(variant: ButtonVariant) {
  return variant === 'primary' || variant === 'secondary' ? RECIPES[variant] : undefined;
}

function labelStyle(variant: ButtonVariant, ariaDisabled: boolean) {
  if (ariaDisabled) {
    // Primary and secondary take the recipe colour; only the other variants need the muted one.
    return recipeOf(variant) ? undefined : styles.labelUnavailable;
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
  // Primary and secondary get their fill, border and shadow from the v2 recipes (recipeFrame).
  primary: { paddingVertical: 14 },
  secondary: { paddingVertical: 14 },
  tinted: { borderColor: v2.roles.link, backgroundColor: v2.roles.wash },
  ghost: {},
  // Text only. The 44px minimum still makes the target; paddingHorizontal keeps the wash off the text edge.
  tertiary: {},
  // The v2 focus colour holds 3:1 on every ground (v2.spec).
  header: { borderColor: v2.roles.focus },
  pressed: { opacity: 0.7 },
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
  labelPrimary: { fontSize: 15 },
  labelLink: { fontSize: 15 },
  labelOnFill: { color: PAGE },
  labelTertiary: { textDecorationLine: 'underline' },
  labelAccent: { color: v2.roles.link },
  labelUnavailable: { color: v2.roles.muted },
});
