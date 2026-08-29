import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import type { FlowProps } from '../app/App';

export function DetailsFormScreen({ flow }: FlowProps) {
  const { selectedTemplate, fields, setField, nextStep, prevStep } = flow;

  if (!selectedTemplate) return null;

  const canProceed = selectedTemplate.fields
    .filter((f) => f.required)
    .every((f) => fields[f.key]?.trim());

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <TouchableOpacity onPress={prevStep} style={styles.backButton}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>{selectedTemplate.name}</Text>
        {selectedTemplate.fields.map((field) => (
          <View key={field.key} style={styles.fieldGroup}>
            <Text style={styles.label}>
              {field.label}
              {!field.required && (
                <Text style={styles.optional}> (optional)</Text>
              )}
            </Text>
            <TextInput
              style={styles.input}
              value={fields[field.key] ?? ''}
              onChangeText={(val) => setField(field.key, val)}
              placeholder={field.placeholder}
              placeholderTextColor="#9ca3af"
            />
          </View>
        ))}
        <TouchableOpacity
          style={[styles.button, !canProceed && styles.buttonDisabled]}
          onPress={nextStep}
          disabled={!canProceed}
          activeOpacity={0.8}
        >
          <Text style={styles.buttonText}>Continue</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, backgroundColor: '#ffffff' },
  content: { padding: 24, paddingTop: 60, paddingBottom: 40 },
  backButton: { marginBottom: 24 },
  backText: { fontSize: 14, color: '#9ca3af' },
  title: { fontSize: 20, fontWeight: '600', color: '#111827', marginBottom: 24 },
  fieldGroup: { marginBottom: 20 },
  label: { fontSize: 14, fontWeight: '500', color: '#374151', marginBottom: 6 },
  optional: { fontWeight: '400', color: '#9ca3af' },
  input: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 14,
    color: '#111827',
  },
  button: {
    backgroundColor: '#6B7FD4',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 12,
  },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { color: '#ffffff', fontSize: 15, fontWeight: '500' },
});
