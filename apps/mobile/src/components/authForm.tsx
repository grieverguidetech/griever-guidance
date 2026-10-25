import { useEffect, useRef } from 'react';
import type { ComponentProps, Ref } from 'react';
import {
  AccessibilityInfo,
  findNodeHandle,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { ReactNode } from 'react';
import { ACCENT, MUTED } from './colors';

/** iOS only: Android reads the live region / alert role, so announcing there would say it twice. */
export function announce(message: string) {
  if (Platform.OS === 'ios') AccessibilityInfo.announceForAccessibility(message);
}

/** A screen heading that takes screen-reader focus when it appears (after a screen swap). */
export function ScreenHeader({ children }: { children: ReactNode }) {
  const ref = useRef<Text>(null);
  useEffect(() => {
    const handle = ref.current ? findNodeHandle(ref.current) : null;
    if (handle) AccessibilityInfo.setAccessibilityFocus(handle);
  }, []);
  return (
    <Text ref={ref} accessibilityRole="header" style={authStyles.title}>
      {children}
    </Text>
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
>;

export function Field({
  label,
  value,
  onChangeText,
  hint,
  inputRef,
  ...input
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  hint?: string;
  inputRef?: Ref<TextInput>;
} & InputProps) {
  return (
    <View style={styles.fieldGroup}>
      {/* The input carries the label for screen readers; this copy is only for sighted users. */}
      <Text style={styles.label} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {label}
      </Text>
      <TextInput
        ref={inputRef}
        style={styles.input}
        accessibilityLabel={label}
        accessibilityHint={hint}
        value={value}
        onChangeText={onChangeText}
        placeholderTextColor={MUTED}
        {...input}
      />
      {hint ? (
        <Text style={styles.hint} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

/** Shows the message in a polite live region and announces it on iOS. */
export function ErrorText({ message }: { message: string | null }) {
  useEffect(() => {
    if (message) announce(message);
  }, [message]);
  return (
    <View accessibilityLiveRegion="polite" style={styles.errorBox}>
      {message ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {message}
        </Text>
      ) : null}
    </View>
  );
}

export function PrimaryButton({ label, pending, onPress }: { label: string; pending: boolean; onPress: () => void }) {
  return (
    <Pressable
      style={({ pressed }) => [styles.button, (pending || pressed) && styles.buttonDisabled]}
      onPress={onPress}
      disabled={pending}
      accessibilityRole="button"
      accessibilityState={{ disabled: pending, busy: pending }}
    >
      <Text style={styles.buttonText}>{label}</Text>
    </Pressable>
  );
}

/** An outlined button for a choice that sits beside the primary action. */
export function SecondaryButton({ label, pending, onPress }: { label: string; pending: boolean; onPress: () => void }) {
  return (
    <Pressable
      style={({ pressed }) => [styles.secondary, (pending || pressed) && styles.buttonDisabled]}
      onPress={onPress}
      disabled={pending}
      accessibilityRole="button"
      accessibilityState={{ disabled: pending }}
    >
      <Text style={styles.secondaryText}>{label}</Text>
    </Pressable>
  );
}

export function LinkButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable style={styles.link} onPress={onPress} accessibilityRole="button">
      <Text style={styles.linkText}>{label}</Text>
    </Pressable>
  );
}

export const authStyles = StyleSheet.create({
  title: { fontSize: 20, fontWeight: '600', color: '#111827', marginBottom: 8 },
  body: { fontSize: 14, color: MUTED, marginBottom: 24 },
});

const styles = StyleSheet.create({
  fieldGroup: { marginBottom: 20 },
  label: { fontSize: 14, fontWeight: '500', color: '#374151', marginBottom: 6 },
  hint: { fontSize: 13, color: MUTED, marginTop: 6 },
  input: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: MUTED,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: '#111827',
  },
  errorBox: { minHeight: 0, marginBottom: 8 },
  error: { fontSize: 14, color: '#b91c1c' },
  button: {
    minHeight: 44,
    backgroundColor: ACCENT,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { color: '#ffffff', fontSize: 15, fontWeight: '500' },
  secondary: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: ACCENT,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },
  secondaryText: { color: ACCENT, fontSize: 15, fontWeight: '500' },
  link: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start', marginTop: 12 },
  linkText: { fontSize: 14, color: ACCENT, fontWeight: '500' },
});
