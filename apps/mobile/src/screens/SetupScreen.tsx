import { useEffect, useRef, useState } from 'react';
import {
  BackHandler,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { ScreenHeader, authStyles } from '../components/authForm';
import { ACCENT, FIELD_BORDER, MUTED } from '../components/colors';

export type SetupDetails = { personName: string; dateOfPassing: string };

type Props = {
  /** What is already kept for this person (empty for someone new). */
  initial: SetupDetails;
  onContinue: (details: SetupDetails) => void;
  onBack: () => void;
};

/**
 * Asked once, before the first message, so the name and date are not typed again in every moment.
 * Only the name is required. There is deliberately no obituary field here (C10).
 */
export function SetupScreen({ initial, onContinue, onBack }: Props) {
  const [name, setName] = useState(initial.personName);
  const [date, setDate] = useState(initial.dateOfPassing);
  const canContinue = name.trim() !== '';
  const dateRef = useRef<TextInput>(null);
  const submit = () => {
    if (canContinue) onContinue({ personName: name.trim(), dateOfPassing: date.trim() });
  };

  // Android's back button means Home here, not leaving the app.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onBack();
      return true;
    });
    return () => sub.remove();
  }, [onBack]);

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Pressable style={styles.back} onPress={onBack} accessibilityRole="button" accessibilityLabel="Back to home">
          <Text style={styles.backText}>← Back</Text>
        </Pressable>
        <ScreenHeader>Who are we writing about?</ScreenHeader>
        <Text style={authStyles.body}>We'll carry this into every message, so you only type it once.</Text>
        <View style={styles.group}>
          {/* The input carries the label for screen readers; the visible copy is hidden from them. */}
          <Text style={styles.label} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            Their name
          </Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="e.g. Margaret Hayes"
            placeholderTextColor={MUTED}
            accessibilityLabel="Their name, required"
            autoCapitalize="words"
            returnKeyType="next"
            blurOnSubmit={false}
            onSubmitEditing={() => dateRef.current?.focus()}
          />
        </View>
        <View style={styles.group}>
          <Text style={styles.label} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            Date of passing
          </Text>
          <TextInput
            ref={dateRef}
            style={styles.input}
            value={date}
            onChangeText={setDate}
            placeholder="e.g. June 7, 2025"
            placeholderTextColor={MUTED}
            accessibilityLabel="Date of passing"
            accessibilityHint="Optional"
            returnKeyType="done"
            onSubmitEditing={submit}
          />
          <Text style={styles.hint} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            Optional
          </Text>
        </View>
        <Pressable
          style={[styles.button, !canContinue && styles.buttonDisabled]}
          onPress={submit}
          disabled={!canContinue}
          accessibilityRole="button"
          accessibilityState={{ disabled: !canContinue }}
          accessibilityHint={canContinue ? undefined : 'Type their name first'}
        >
          <Text style={styles.buttonText}>Continue</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#ffffff' },
  screen: { flex: 1, backgroundColor: '#ffffff' },
  content: { padding: 24, paddingTop: 60, paddingBottom: 40 },
  back: { minHeight: 44, minWidth: 44, justifyContent: 'center', alignSelf: 'flex-start', marginBottom: 16 },
  backText: { fontSize: 16, color: MUTED },
  group: { marginBottom: 20 },
  label: { fontSize: 14, fontWeight: '500', color: '#374151', marginBottom: 6 },
  hint: { fontSize: 13, color: MUTED, marginTop: 6 },
  input: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: FIELD_BORDER,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: '#111827',
  },
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
});
