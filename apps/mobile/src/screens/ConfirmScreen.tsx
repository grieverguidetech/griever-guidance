import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import type { FlowProps } from '../app/App';

export function ConfirmScreen({ flow }: FlowProps) {
  const { selectedTemplate, composedMessage, selectedContactIds, prevStep, startSendJob } = flow;

  if (!selectedTemplate) return null;

  const recipientCount = selectedContactIds.length;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <TouchableOpacity onPress={prevStep} style={styles.backButton}>
        <Text style={styles.backText}>← Back</Text>
      </TouchableOpacity>
      <Text style={styles.title}>Review your message</Text>
      <Text style={styles.subtitle}>
        You'll text each of {recipientCount} {recipientCount === 1 ? 'person' : 'people'} from
        your own number, one at a time.
      </Text>
      <View style={styles.messageBox}>
        <Text style={styles.messageText}>{composedMessage}</Text>
      </View>
      <TouchableOpacity
        style={styles.button}
        onPress={startSendJob}
        disabled={recipientCount === 0}
        activeOpacity={0.8}
      >
        <Text style={styles.buttonText}>Text these people</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ffffff' },
  content: { padding: 24, paddingTop: 60, paddingBottom: 40 },
  backButton: { marginBottom: 24 },
  backText: { fontSize: 14, color: '#9ca3af' },
  title: { fontSize: 20, fontWeight: '600', color: '#111827', marginBottom: 8 },
  subtitle: { fontSize: 14, color: '#9ca3af', marginBottom: 24 },
  messageBox: {
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    padding: 20,
    marginBottom: 32,
  },
  messageText: { fontSize: 14, color: '#374151', lineHeight: 22 },
  button: {
    backgroundColor: '#6B7FD4',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  buttonText: { color: '#ffffff', fontSize: 15, fontWeight: '500' },
});
