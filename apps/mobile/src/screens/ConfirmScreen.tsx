import { useState } from 'react';
import { View, Text, TextInput, AccessibilityInfo, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { SHARE_SERVICE_SAMPLE } from '@griever/shared';
import type { FlowProps } from '../app/App';
import { ACCENT, FIELD_BORDER, MUTED } from '../components/colors';

export function ConfirmScreen({ flow }: FlowProps) {
  const { selectedTemplate, composedMessage, selectedContactIds, prevStep, startSendJob, setMessageOverride } = flow;
  const [sampleOpen, setSampleOpen] = useState(false);
  const [focused, setFocused] = useState(false);

  if (!selectedTemplate) return null;

  const recipientCount = selectedContactIds.length;
  const isService = flow.templateCategory === 'service';
  const isBlank = isService && composedMessage.trim() === '';

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <TouchableOpacity onPress={prevStep} style={styles.backButton}>
        <Text style={styles.backText}>← Back</Text>
      </TouchableOpacity>
      <Text style={styles.title}>Review your message</Text>
      <Text style={styles.subtitle}>
        You'll text each of {recipientCount} {recipientCount === 1 ? 'person' : 'people'} from
        your own number, one at a time.
      </Text>
      <View style={styles.messageBox}>
        {isService ? (
          <>
            <Text style={styles.fieldLabel}>Your message</Text>
            <TextInput
              style={[styles.messageInput, focused && styles.messageInputFocused]}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              value={composedMessage}
              onChangeText={setMessageOverride}
              multiline
              accessibilityLabel="Your message"
            />
          </>
        ) : (
          <Text style={styles.messageText}>{composedMessage}</Text>
        )}
      </View>
      {isService && (
        <View style={styles.sample}>
          <TouchableOpacity
            style={styles.sampleToggle}
            onPress={() => {
              if (!sampleOpen) AccessibilityInfo.announceForAccessibility(SHARE_SERVICE_SAMPLE);
              setSampleOpen((v) => !v);
            }}
            accessibilityRole="button"
            accessibilityLabel="Sample message"
            accessibilityState={{ expanded: sampleOpen }}
          >
            <Text style={styles.sampleToggleText}>Sample message</Text>
          </TouchableOpacity>
          {sampleOpen && <Text style={styles.messageText}>{SHARE_SERVICE_SAMPLE}</Text>}
        </View>
      )}
      <TouchableOpacity
        style={styles.button}
        onPress={startSendJob}
        disabled={recipientCount === 0 || isBlank}
        accessibilityRole="button"
        accessibilityState={{ disabled: recipientCount === 0 || isBlank }}
        activeOpacity={0.8}
      >
        <Text style={styles.buttonText}>Text these people</Text>
      </TouchableOpacity>
      {isBlank && <Text style={styles.blankNote}>Add a message before you send it.</Text>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ffffff' },
  content: { padding: 24, paddingTop: 60, paddingBottom: 40 },
  backButton: { marginBottom: 24 },
  backText: { fontSize: 14, color: MUTED },
  title: { fontSize: 20, fontWeight: '600', color: '#111827', marginBottom: 8 },
  subtitle: { fontSize: 14, color: MUTED, marginBottom: 24 },
  messageBox: {
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    padding: 20,
    marginBottom: 32,
  },
  messageText: { fontSize: 14, color: '#374151', lineHeight: 22 },
  fieldLabel: { fontSize: 13, color: MUTED, marginBottom: 6 },
  messageInput: { borderWidth: 1, borderColor: FIELD_BORDER, borderRadius: 8, padding: 8, fontSize: 14, color: '#374151', lineHeight: 22, minHeight: 120, textAlignVertical: 'top' },
  messageInputFocused: { borderColor: ACCENT, borderWidth: 2 },
  blankNote: { fontSize: 13, color: MUTED, textAlign: 'center', marginTop: 12 },
  sample: { marginBottom: 24 },
  sampleToggle: { minHeight: 44, minWidth: 44, justifyContent: 'center' },
  sampleToggleText: { fontSize: 14, color: ACCENT },
  button: {
    backgroundColor: ACCENT,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  buttonText: { color: '#ffffff', fontSize: 15, fontWeight: '500' },
});
