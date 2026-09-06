import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import type { UseContactsResult } from '@griever/hooks';
import {
  Cancelled,
  detectDeviceRegion,
  runImport,
  toE164,
  type NormalizedContact,
} from '@griever/contacts';
import type { Contact } from '@griever/shared';
import { expoContactsSource } from '../lib/expoContactsSource';
import type { FlowProps } from '../app/App';

interface Props extends FlowProps {
  contacts: UseContactsResult;
}

type Mode = { kind: 'list' } | { kind: 'reviewing'; fresh: NormalizedContact[] } | { kind: 'adding' };

export function ContactSelectorScreen({ flow, contacts }: Props) {
  const { selectedContactIds, toggleContact, nextStep, prevStep } = flow;
  const [mode, setMode] = useState<Mode>({ kind: 'list' });
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [reviewSelected, setReviewSelected] = useState<Set<string>>(new Set());
  const [manualName, setManualName] = useState('');
  const [manualPhone, setManualPhone] = useState('');
  const [manualError, setManualError] = useState<string | null>(null);

  const selectedIds = new Set(selectedContactIds);

  async function handleImport() {
    setImporting(true);
    setImportError(null);
    try {
      const storedPhones = new Set(contacts.contacts.map((c) => c.phone));
      const result = await runImport(expoContactsSource, storedPhones, detectDeviceRegion());
      setReviewSelected(new Set(result.fresh.filter((c) => c.starred).map((c) => c.key)));
      setMode({ kind: 'reviewing', fresh: result.fresh });
    } catch (err) {
      if (!(err instanceof Cancelled)) {
        setImportError('We could not read your contacts. You can add people by hand instead.');
      }
    } finally {
      setImporting(false);
    }
  }

  async function commitReview() {
    if (mode.kind !== 'reviewing') return;
    const picked = mode.fresh
      .filter((c) => reviewSelected.has(c.key))
      .map((c) => ({ name: c.displayName, phone: c.phone, email: c.email, tier: 'family' as const }));
    if (picked.length > 0) await contacts.importContacts(picked, 'native');
    setMode({ kind: 'list' });
  }

  async function handleAddManual() {
    if (!manualName.trim() || !manualPhone.trim()) return;
    const phone = toE164(manualPhone, detectDeviceRegion());
    if (!phone) {
      setManualError("That number doesn't look right — check the area code and digits.");
      return;
    }
    await contacts.addContact({ name: manualName.trim(), phone, tier: 'family' });
    setManualName('');
    setManualPhone('');
    setManualError(null);
    setMode({ kind: 'list' });
  }

  function renderContact({ item }: { item: Contact }) {
    const selected = selectedIds.has(item.contactId);
    return (
      <TouchableOpacity
        style={[styles.row, selected && styles.rowSelected]}
        onPress={() => toggleContact(item.contactId)}
        activeOpacity={0.7}
      >
        <View style={styles.rowInfo}>
          <Text style={styles.name}>{item.name}</Text>
          <Text style={styles.phone}>{item.phone}</Text>
        </View>
        <View style={[styles.checkbox, selected && styles.checkboxSelected]}>
          {selected && <Text style={styles.checkmark}>✓</Text>}
        </View>
      </TouchableOpacity>
    );
  }

  if (mode.kind === 'reviewing') {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => setMode({ kind: 'list' })}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Bring people across</Text>
          <Text style={styles.subtitle}>Choose only the ones you want — the rest stay where they are.</Text>
        </View>
        <FlatList
          data={mode.fresh}
          keyExtractor={(item) => item.key}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<Text style={styles.empty}>No new contacts with a mobile number found.</Text>}
          renderItem={({ item }) => {
            const selected = reviewSelected.has(item.key);
            return (
              <TouchableOpacity
                style={[styles.row, selected && styles.rowSelected]}
                onPress={() =>
                  setReviewSelected((current) => {
                    const next = new Set(current);
                    if (next.has(item.key)) next.delete(item.key);
                    else next.add(item.key);
                    return next;
                  })
                }
                activeOpacity={0.7}
              >
                <View style={styles.rowInfo}>
                  <Text style={styles.name}>{item.displayName}</Text>
                  <Text style={styles.phone}>{item.phone}</Text>
                </View>
                <View style={[styles.checkbox, selected && styles.checkboxSelected]}>
                  {selected && <Text style={styles.checkmark}>✓</Text>}
                </View>
              </TouchableOpacity>
            );
          }}
        />
        <View style={styles.footer}>
          <Text style={styles.count}>{reviewSelected.size} chosen</Text>
          <TouchableOpacity
            style={[styles.button, reviewSelected.size === 0 && styles.buttonDisabled]}
            onPress={commitReview}
            disabled={reviewSelected.size === 0}
            activeOpacity={0.8}
          >
            <Text style={styles.buttonText}>Add</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (mode.kind === 'adding') {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => setMode({ kind: 'list' })}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Add someone by hand</Text>
        </View>
        <View style={styles.formArea}>
          <Text style={styles.label}>Name</Text>
          <TextInput
            style={styles.input}
            value={manualName}
            onChangeText={setManualName}
            placeholder="e.g. Aunt Carol"
            placeholderTextColor="#9ca3af"
          />
          <Text style={styles.label}>Mobile number</Text>
          <TextInput
            style={styles.input}
            value={manualPhone}
            onChangeText={(v) => {
              setManualPhone(v);
              setManualError(null);
            }}
            placeholder="(617) 555-0148"
            placeholderTextColor="#9ca3af"
            keyboardType="phone-pad"
          />
          {manualError && <Text style={styles.errorText}>{manualError}</Text>}
          <TouchableOpacity
            style={[styles.button, styles.buttonBlock, (!manualName.trim() || !manualPhone.trim()) && styles.buttonDisabled]}
            onPress={handleAddManual}
            disabled={!manualName.trim() || !manualPhone.trim()}
            activeOpacity={0.8}
          >
            <Text style={styles.buttonText}>Add</Text>
          </TouchableOpacity>
        </View>
      </View>
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
        data={contacts.contacts}
        keyExtractor={(item) => item.contactId}
        renderItem={renderContact}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          contacts.loading ? (
            <ActivityIndicator color="#9ca3af" style={{ marginTop: 24 }} />
          ) : (
            <Text style={styles.empty}>No one saved yet — bring people across or add them by hand.</Text>
          )
        }
      />
      {importError && <Text style={[styles.errorText, styles.errorSpacing]}>{importError}</Text>}
      <View style={styles.addRow}>
        <TouchableOpacity style={styles.addButton} onPress={handleImport} disabled={importing} activeOpacity={0.8}>
          {importing ? (
            <ActivityIndicator color="#6B7FD4" size="small" />
          ) : (
            <Text style={styles.addButtonText}>Import from contacts</Text>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => setMode({ kind: 'adding' })}
          activeOpacity={0.8}
        >
          <Text style={styles.addButtonText}>Add by hand</Text>
        </TouchableOpacity>
      </View>
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
  list: { paddingHorizontal: 24, paddingTop: 12, flexGrow: 1 },
  empty: { fontSize: 13, color: '#9ca3af', textAlign: 'center', marginTop: 24 },
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
  addRow: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 24,
    paddingBottom: 12,
  },
  addButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  addButtonText: { color: '#6B7FD4', fontSize: 13, fontWeight: '500' },
  errorText: { fontSize: 12, color: '#ef4444' },
  errorSpacing: { paddingHorizontal: 24, marginBottom: 8 },
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
  buttonBlock: { alignItems: 'center', paddingHorizontal: 0, marginTop: 8 },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { color: '#ffffff', fontSize: 14, fontWeight: '500' },
  formArea: { paddingHorizontal: 24 },
  label: { fontSize: 14, fontWeight: '500', color: '#374151', marginBottom: 6, marginTop: 16 },
  input: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 14,
    color: '#111827',
  },
});
