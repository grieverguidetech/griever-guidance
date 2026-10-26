import { useEffect, useRef, useState } from 'react';
import type { ComponentProps, ComponentRef, ReactNode, Ref } from 'react';
import { AccessibilityInfo, findNodeHandle, Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, minTouchTarget } from '@griever/tokens';
import { Body, Button, Heading, useSerifStyle } from '@griever/ui';

/** Errors use the same pink as web's Clerk appearance (colorDanger); 7:1 on white. */
const DANGER = colors['accent-2-700'];
/** Focus ring, as web's Clerk colorRing. */
const RING = colors['accent-700'];
const FIELD_BORDER = colors['neutral-600'];

/** iOS only: Android reads the live region / alert role, so announcing there would say it twice. */
export function announce(message: string) {
  if (Platform.OS === 'ios') {
    AccessibilityInfo.announceForAccessibility(message);
  }
}

/** A screen heading that takes screen-reader focus when it appears (after a screen swap). */
export function ScreenHeader({ children }: { children: ReactNode }) {
  const ref = useRef<ComponentRef<typeof Text>>(null);
  useEffect(() => {
    const handle = ref.current ? findNodeHandle(ref.current) : null;
    if (handle) {
      AccessibilityInfo.setAccessibilityFocus(handle);
    }
  }, []);
  return (
    <View style={styles.header}>
      <Heading level={1} headingRef={ref}>
        {children}
      </Heading>
    </View>
  );
}

/** The calm line under the heading. */
export function Intro({ children }: { children: ReactNode }) {
  return (
    <View style={styles.intro}>
      <Body tone="muted">{children}</Body>
    </View>
  );
}

type InputProps = Pick<
  ComponentProps<typeof TextInput>,
  | 'textContentType'
  | 'autoComplete'
  | 'keyboardType'
  | 'secureTextEntry'
  | 'autoCapitalize'
  | 'autoCorrect'
  | 'returnKeyType'
  | 'onSubmitEditing'
  | 'editable'
  | 'maxLength'
  | 'onFocus'
  | 'onBlur'
>;

export function Field({
  label,
  value,
  onChangeText,
  hint,
  inputRef,
  onFocus,
  onBlur,
  ...input
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  hint?: string;
  inputRef?: Ref<ComponentRef<typeof TextInput>>;
} & InputProps) {
  const [focused, setFocused] = useState(false);
  const labelFont = useSerifStyle('semibold');
  const inputFont = useSerifStyle('regular');
  return (
    <View style={styles.fieldGroup}>
      {/* The input carries the label for screen readers; this copy is only for sighted users. */}
      <Text
        style={[styles.label, labelFont]}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {label}
      </Text>
      <TextInput
        ref={inputRef}
        style={[styles.input, inputFont, focused && styles.inputFocused]}
        accessibilityLabel={label}
        accessibilityHint={hint}
        value={value}
        onChangeText={onChangeText}
        placeholderTextColor={colors['neutral-700']}
        {...input}
        // After the spread, so nothing a caller passes can drop the focus ring.
        onFocus={(event) => {
          setFocused(true);
          onFocus?.(event);
        }}
        onBlur={(event) => {
          setFocused(false);
          onBlur?.(event);
        }}
      />
      {hint ? (
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.hint}>
          <Body tone="muted" small>
            {hint}
          </Body>
        </View>
      ) : null}
    </View>
  );
}

/** Shows the message in a polite live region and announces it on iOS. */
export function ErrorText({ message }: { message: string | null }) {
  const font = useSerifStyle('regular');
  useEffect(() => {
    if (message) {
      announce(message);
    }
  }, [message]);
  return (
    <View accessibilityLiveRegion="polite" style={styles.errorBox}>
      {message ? (
        <Text accessibilityRole="alert" style={[styles.error, font]}>
          {message}
        </Text>
      ) : null}
    </View>
  );
}

/** A calm confirmation line in a polite live region (for example "We sent a new code."). */
export function Notice({ message }: { message: string | null }) {
  return (
    <View accessibilityLiveRegion="polite">
      {message ? (
        <View style={styles.notice}>
          <Body tone="muted">{message}</Body>
        </View>
      ) : null}
    </View>
  );
}

type ActionProps = { label: string; onPress: () => void; pending?: boolean };

/** The main action. While `pending` it reads as busy and a second press is ignored by the screen. */
export function PrimaryButton({ label, pending = false, onPress }: ActionProps) {
  return (
    <View style={styles.action}>
      <Button label={label} onPress={onPress} busy={pending} ariaDisabled={pending} />
    </View>
  );
}

/** An outlined button for a choice that sits beside the primary action. */
export function SecondaryButton({ label, pending = false, onPress }: ActionProps) {
  return (
    <View style={styles.action}>
      <Button label={label} onPress={onPress} variant="secondary" busy={pending} ariaDisabled={pending} />
    </View>
  );
}

/**
 * A text-style action ("Create an account"). TODO: use the `tertiary` Button variant once #341
 * lands; until then the existing `ghost` variant is the closest look.
 */
export function LinkButton({ label, onPress, pending = false }: ActionProps) {
  return (
    <View style={styles.link}>
      <Button label={label} onPress={onPress} variant="ghost" busy={pending} ariaDisabled={pending} />
    </View>
  );
}

/** Plain body text for the other screens that share this form kit. */
export const authStyles = StyleSheet.create({
  body: { fontSize: 14, color: colors['neutral-700'], marginBottom: 24 },
});

const styles = StyleSheet.create({
  header: { marginBottom: 8 },
  intro: { marginBottom: 24 },
  fieldGroup: { marginBottom: 20 },
  label: { fontSize: 14, fontWeight: '500', color: colors['neutral-800'], marginBottom: 6 },
  hint: { marginTop: 6 },
  input: {
    minHeight: minTouchTarget,
    borderWidth: 1,
    borderColor: FIELD_BORDER,
    borderRadius: 10,
    backgroundColor: colors['neutral-100'],
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.ink,
  },
  // The ring is a thicker border in the same box, so the field does not shift when focused.
  inputFocused: { borderColor: RING, borderWidth: 2, paddingHorizontal: 15, paddingVertical: 11 },
  errorBox: { minHeight: 0, marginBottom: 8 },
  error: { fontSize: 14, lineHeight: 20, color: DANGER },
  notice: { marginBottom: 4 },
  action: { marginTop: 12 },
  link: { marginTop: 4, alignSelf: 'flex-start' },
});
