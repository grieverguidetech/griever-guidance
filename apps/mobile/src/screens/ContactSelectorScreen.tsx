import { useState } from 'react';
import { View, TouchableOpacity, FlatList, StyleSheet, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import type { UseContactsResult } from '@griever/hooks';
import { Cancelled, detectDeviceRegion, runImport, toE164, type NormalizedContact } from '@griever/contacts';
import { fill, screenCopy } from '@griever/copy';
import { colors, spacing } from '@griever/tokens';
import { Button, WhoShouldKnow, SerifText as Text } from '@griever/ui';
import { expoContactsSource } from '../lib/expoContactsSource';
import type { FlowProps } from '../app/App';
import { SavedNote } from '../components/SavedNote';
import { ACCENT, ACCENT_TINT, FIELD_BORDER, MUTED, MUTED_STRONG } from '../components/colors';

interface Props extends FlowProps {
  contacts: UseContactsResult;
}

type Mode = { kind: 'list' } | { kind: 'reviewing'; fresh: NormalizedContact[] };

const copy = screenCopy('whoShouldKnow');

/**
 * The list is the shared WhoShouldKnow in libs/ui. This holds what is mobile only: Bring people
 * across (import from the phone's contacts) and its review list.
 */
export function ContactSelectorScreen({ flow, contacts }: Props) {
  const { selectedContactIds, toggleContact, selectContacts, nextStep, prevStep, templateCategory } = flow;
  const [mode, setMode] = useState<Mode>({ kind: 'list' });
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [reviewSelected, setReviewSelected] = useState<Set<string>>(new Set());

  // Same rule as web: group only for announcements, and only when both groups have people.
  const tiers = new Set(contacts.contacts.map((c) => c.tier ?? 'family'));
  const grouped = templateCategory === 'announcement' && tiers.size > 1;

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
        setImportError(copy.importError);
      }
    } finally {
      setImporting(false);
    }
  }

  async function commitReview() {
    if (mode.kind !== 'reviewing') {
      return;
    }
    const picked = mode.fresh
      .filter((c) => reviewSelected.has(c.key))
      .map((c) => ({ name: c.displayName, phone: c.phone, email: c.email, tier: 'family' as const }));
    if (picked.length > 0) {
      await contacts.importContacts(picked, 'native');
    }
    setMode({ kind: 'list' });
  }

  if (mode.kind === 'reviewing') {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Button label={copy.back} variant="header" onPress={() => setMode({ kind: 'list' })} />
          <Text accessibilityRole="header" style={styles.title}>
            {copy.bringAcross}
          </Text>
          <Text style={styles.subtitle}>{copy.importIntro}</Text>
        </View>
        <FlatList
          data={mode.fresh}
          keyExtractor={(item) => item.key}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<Text style={styles.empty}>{copy.importEmpty}</Text>}
          renderItem={({ item }) => {
            const selected = reviewSelected.has(item.key);
            return (
              <TouchableOpacity
                style={[styles.row, selected && styles.rowSelected]}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: selected }}
                onPress={() =>
                  setReviewSelected((current) => {
                    const next = new Set(current);
                    if (next.has(item.key)) {
                      next.delete(item.key);
                    } else {
                      next.add(item.key);
                    }
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
                  {selected && (
                    <Text
                      style={styles.checkmark}
                      accessibilityElementsHidden
                      importantForAccessibility="no-hide-descendants"
                    >
                      ✓
                    </Text>
                  )}
                </View>
              </TouchableOpacity>
            );
          }}
        />
        <View style={styles.footer}>
          <Text style={styles.count}>{fill(copy.chosen, { count: reviewSelected.size })}</Text>
          <TouchableOpacity
            style={[styles.button, reviewSelected.size === 0 && styles.buttonDisabled]}
            onPress={commitReview}
            disabled={reviewSelected.size === 0}
            activeOpacity={0.8}
          >
            <Text style={styles.buttonText}>{copy.add}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.flex} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <WhoShouldKnow
          copy={copy}
          people={contacts.contacts.map((c) => ({ id: c.contactId, name: c.name, phone: c.phone, tier: c.tier }))}
          grouped={grouped}
          selectedIds={selectedContactIds}
          selectedLabel={fill(copy.selected, { count: selectedContactIds.length })}
          loading={contacts.loading}
          onToggle={toggleContact}
          onSelectAll={selectContacts}
          toE164={(raw) => toE164(raw, detectDeviceRegion())}
          onAddPerson={async ({ name, phone }) => {
            const created = await contacts.addContact({ name, phone, tier: 'family' });
            toggleContact(created.contactId);
          }}
          onBack={prevStep}
          onContinue={nextStep}
          bringAcross={{ onPress: handleImport, busy: importing, notice: importError ?? undefined }}
          footer={<SavedNote />}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing[3], paddingTop: spacing[4] },
  container: { flex: 1, backgroundColor: '#ffffff' },
  header: { paddingHorizontal: 24, paddingTop: 60, paddingBottom: 16 },
  title: { fontSize: 20, fontWeight: '600', color: '#111827', marginBottom: 4 },
  subtitle: { fontSize: 14, color: MUTED },
  list: { paddingHorizontal: 24, paddingTop: 12, flexGrow: 1 },
  empty: { fontSize: 13, color: MUTED, textAlign: 'center', marginTop: 24 },
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
  rowSelected: { borderColor: ACCENT, backgroundColor: ACCENT_TINT },
  rowInfo: { flex: 1 },
  name: { fontSize: 14, fontWeight: '500', color: '#111827' },
  phone: { fontSize: 12, color: MUTED_STRONG, marginTop: 2 },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: FIELD_BORDER,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxSelected: { backgroundColor: ACCENT, borderColor: ACCENT },
  checkmark: { color: '#ffffff', fontSize: 12, fontWeight: '700' },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 24,
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
  },
  count: { fontSize: 14, color: MUTED },
  button: {
    backgroundColor: ACCENT,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { color: '#ffffff', fontSize: 14, fontWeight: '500' },
});
