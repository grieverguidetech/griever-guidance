import { View, TouchableOpacity, ScrollView, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { SerifText as Text, SerifTextInput as TextInput, Button } from '@griever/ui';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { FlowProps, RootStackParamList } from '../app/App';
import { SavedNote } from '../components/SavedNote';
import { ACCENT, FIELD_BORDER, MUTED } from '../components/colors';

export function DetailsFormScreen({ flow }: FlowProps) {
  const { selectedTemplate, fields, setField, nextStep, prevStep } = flow;
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

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
        <View style={styles.topBar}>
          <Button label="Back" variant="header" onPress={prevStep} />
          <Button label="What you'll need" variant="header" onPress={() => navigation.navigate('WhatYoullNeed')} />
        </View>
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
              placeholderTextColor={MUTED}
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
        <SavedNote />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, backgroundColor: '#ffffff' },
  content: { padding: 24, paddingTop: 60, paddingBottom: 40 },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  title: { fontSize: 20, fontWeight: '600', color: '#111827', marginBottom: 24 },
  fieldGroup: { marginBottom: 20 },
  label: { fontSize: 14, fontWeight: '500', color: '#374151', marginBottom: 6 },
  optional: { fontWeight: '400', color: MUTED },
  input: {
    borderWidth: 1,
    borderColor: FIELD_BORDER,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 14,
    color: '#111827',
  },
  button: {
    backgroundColor: ACCENT,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 12,
  },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { color: '#ffffff', fontSize: 15, fontWeight: '500' },
});
