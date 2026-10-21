import { useEffect, useState } from 'react';
import { BackHandler, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { Field, ScreenHeader, authStyles } from '../components/authForm';
import { ACCENT, MUTED } from '../components/colors';

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
        <Field
          label="Their name"
          value={name}
          onChangeText={setName}
          autoCapitalize="words"
          hint="Required"
        />
        <Field label="Date of passing" value={date} onChangeText={setDate} hint="Optional. For example, June 7, 2025" />
        <Pressable
          style={[styles.button, !canContinue && styles.buttonDisabled]}
          onPress={() => canContinue && onContinue({ personName: name.trim(), dateOfPassing: date.trim() })}
          disabled={!canContinue}
          accessibilityRole="button"
          accessibilityState={{ disabled: !canContinue }}
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
  backText: { fontSize: 14, color: MUTED },
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
