import { View, Text, TouchableOpacity, FlatList, StyleSheet } from 'react-native';
import { useMockContacts } from '@griever/hooks';
import type { Contact } from '@griever/shared';
import type { FlowProps } from '../app/App';

export function ContactSelectorScreen({ flow }: FlowProps) {
  const { selectedContactIds, toggleContact, nextStep, prevStep } = flow;
  const contacts = useMockContacts();

  const selectedIds = new Set(selectedContactIds);

  function renderContact({ item }: { item: Contact }) {
    const selected = selectedIds.has(item.id);
    return (
      <TouchableOpacity
        style={[styles.row, selected && styles.rowSelected]}
        onPress={() => toggleContact(item.id)}
        activeOpacity={0.7}
      >
        <View style={styles.rowInfo}>
          <Text style={styles.name}>{item.name}</Text>
          <Text style={styles.phone}>{item.phoneNumber}</Text>
        </View>
        <View style={[styles.checkbox, selected && styles.checkboxSelected]}>
          {selected && <Text style={styles.checkmark}>✓</Text>}
        </View>
      </TouchableOpacity>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={prevStep}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Select recipients</Text>
        <Text style={styles.subtitle}>Choose who should receive this message.</Text>
      </View>
      <FlatList
        data={contacts}
        keyExtractor={(item) => item.id}
        renderItem={renderContact}
        contentContainerStyle={styles.list}
      />
      <View style={styles.footer}>
        <Text style={styles.count}>
          {selectedContactIds.length === 0
            ? 'No recipients selected'
            : `${selectedContactIds.length} selected`}
        </Text>
        <TouchableOpacity
          style={[styles.button, selectedContactIds.length === 0 && styles.buttonDisabled]}
          onPress={nextStep}
          disabled={selectedContactIds.length === 0}
          activeOpacity={0.8}
        >
          <Text style={styles.buttonText}>Continue</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ffffff' },
  header: { paddingHorizontal: 24, paddingTop: 60, paddingBottom: 16 },
  backText: { fontSize: 14, color: '#9ca3af', marginBottom: 24 },
  title: { fontSize: 20, fontWeight: '600', color: '#111827', marginBottom: 4 },
  subtitle: { fontSize: 14, color: '#9ca3af' },
  list: { paddingHorizontal: 24, paddingTop: 12 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#f3f4f6',
    marginBottom: 8,
  },
  rowSelected: { borderColor: '#6B7FD4', backgroundColor: '#eef0fb' },
  rowInfo: { flex: 1 },
  name: { fontSize: 14, fontWeight: '500', color: '#111827' },
  phone: { fontSize: 12, color: '#9ca3af', marginTop: 2 },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#d1d5db',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxSelected: { backgroundColor: '#6B7FD4', borderColor: '#6B7FD4' },
  checkmark: { color: '#ffffff', fontSize: 12, fontWeight: '700' },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 24,
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
  },
  count: { fontSize: 14, color: '#6b7280' },
  button: {
    backgroundColor: '#6B7FD4',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { color: '#ffffff', fontSize: 14, fontWeight: '500' },
});
