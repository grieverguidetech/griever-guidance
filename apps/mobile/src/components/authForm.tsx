import { useEffect } from 'react';
import type { ComponentProps } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

type InputProps = Pick<
  ComponentProps<typeof TextInput>,
  'textContentType' | 'autoComplete' | 'keyboardType' | 'secureTextEntry' | 'autoCapitalize' | 'autoCorrect'
>;

export function Field({
  label,
  value,
  onChangeText,
  ...input
}: { label: string; value: string; onChangeText: (v: string) => void } & InputProps) {
  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={styles.input}
        accessibilityLabel={label}
        value={value}
        onChangeText={onChangeText}
        placeholderTextColor="#9ca3af"
        {...input}
      />
    </View>
  );
}

/** Shows the message in a polite live region and announces it on iOS, where live regions do not exist. */
export function ErrorText({ message }: { message: string | null }) {
  useEffect(() => {
    if (message) AccessibilityInfo.announceForAccessibility(message);
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

export function LinkButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable style={styles.link} onPress={onPress} accessibilityRole="button">
      <Text style={styles.linkText}>{label}</Text>
    </Pressable>
  );
}

export const authStyles = StyleSheet.create({
  title: { fontSize: 20, fontWeight: '600', color: '#111827', marginBottom: 8 },
  body: { fontSize: 14, color: '#6b7280', marginBottom: 24 },
});

const styles = StyleSheet.create({
  fieldGroup: { marginBottom: 20 },
  label: { fontSize: 14, fontWeight: '500', color: '#374151', marginBottom: 6 },
  input: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: '#e5e7eb',
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
    backgroundColor: '#6B7FD4',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { color: '#ffffff', fontSize: 15, fontWeight: '500' },
  link: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start', marginTop: 12 },
  linkText: { fontSize: 14, color: '#6B7FD4', fontWeight: '500' },
});
