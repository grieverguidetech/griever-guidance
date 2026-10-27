import { useCallback, useEffect, useRef, useState, type ComponentRef } from 'react';
import { ActivityIndicator, BackHandler, FlatList, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SerifText as Text, Button } from '@griever/ui';
import type { UseContactsResult } from '@griever/hooks';
import { Cancelled, detectDeviceRegion, runImport, toE164 } from '@griever/contacts';
import type { NormalizedContact } from '@griever/contacts';
import { screenCopy } from '@griever/copy';
import { expoContactsSource } from '../lib/expoContactsSource';
import { ErrorText, Field, ScreenHeader, announce, authStyles } from '../components/authForm';
import { ACCENT, ACCENT_TINT, FIELD_BORDER, MUTED, MUTED_STRONG } from '../components/colors';

type Props = {
  contacts: UseContactsResult;
  /** At least one contact is saved. */
  onContinue: () => void;
  /** Back to where this opened: setup, or Home. */
  onBack: () => void;
  /** Opened from Home: read the phone's contacts once the saved list has loaded. Back from the review calls onBack; Add calls onContinue. */
  startWithImport?: boolean;
};

type Mode = { kind: 'start' } | { kind: 'adding' } | { kind: 'reviewing'; fresh: NormalizedContact[] };

const copy = screenCopy('whoShouldKnow');
const BAD_NUMBER = "That number doesn't look right — check the area code and digits.";
const ADD_FAILED = 'We could not save that. Please try again.';
const IMPORT_FAILED = 'We could not read your contacts. You can add people by hand instead.';

/**
 * Shown once after setup, only when this phone has no saved contacts (the same rule as web).
 * Contacts stay on the device (C3); only the seven Contact fields are kept (C4).
 */
export function ContactsStepScreen({ contacts, onContinue, onBack, startWithImport = false }: Props) {
  const [mode, setMode] = useState<Mode>({ kind: 'start' });
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [status, setStatus] = useState('');
  const phoneRef = useRef<ComponentRef<typeof TextInput>>(null);
  const say = (message: string) => {
    setStatus(message);
    announce(message);
  };

  // Back goes up one level; from the review it leaves the screen when it was opened from Home.
  const leaveStep = useCallback(() => {
    if (mode.kind === 'start' || (startWithImport && mode.kind === 'reviewing')) {
      onBack();
    } else {
      setMode({ kind: 'start' });
    }
  }, [mode.kind, startWithImport, onBack]);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      leaveStep();
      return true;
    });
    return () => sub.remove();
  }, [leaveStep]);

  async function importFromPhone() {
    setImporting(true);
    setError(null);
    try {
      const stored = new Set(contacts.contacts.map((c) => c.phone));
      const result = await runImport(expoContactsSource, stored, detectDeviceRegion());
      // Nothing is preselected: the person chooses (as web).
      setChosen(new Set());
      setMode({ kind: 'reviewing', fresh: result.fresh });
    } catch (err) {
      // Saying no to the permission is "nothing chosen", not an error.
      if (!(err instanceof Cancelled)) setError(IMPORT_FAILED);
    } finally {
      setImporting(false);
    }
  }

  async function addChosen(fresh: NormalizedContact[]) {
    const picked = fresh
      .filter((c) => chosen.has(c.key))
      .map((c) => ({ name: c.displayName, phone: c.phone, email: c.email, tier: 'family' as const }));
    try {
      if (picked.length > 0) await contacts.importContacts(picked, 'native');
    } catch {
      setError(ADD_FAILED);
      return;
    }
    say(`${picked.length} added`);
    if (startWithImport) {
      onContinue();
      return;
    }
    setMode({ kind: 'start' });
  }

  async function addByHand() {
    if (!name.trim() || !phone.trim()) {
      setError('Type a name and a mobile number.');
      return;
    }
    const e164 = toE164(phone, detectDeviceRegion());
    if (!e164) {
      setError(BAD_NUMBER);
      return;
    }
    const added = name.trim();
    try {
      await contacts.addContact({ name: added, phone: e164, tier: 'family' });
    } catch {
      setError(ADD_FAILED);
      return;
    }
    say(`Added ${added}`);
    setName('');
    setPhone('');
    setError(null);
    setMode({ kind: 'start' });
  }

  const started = useRef(false);
  useEffect(() => {
    // Wait for the saved list, so numbers already kept are not offered again.
    if (startWithImport && !contacts.loading && !started.current) {
      started.current = true;
      void importFromPhone();
    }
  });

  const back = (
    <View style={styles.backRow}>
      <Button label="Back" variant="header" onPress={leaveStep} />
    </View>
  );

  if (mode.kind === 'reviewing') {
    const { fresh } = mode;
    return (
      <View style={styles.screen}>
        <View style={styles.header}>
          {back}
          <ScreenHeader>{copy.bringAcross}</ScreenHeader>
          <Text style={authStyles.body}>{copy.importIntro}</Text>
        </View>
        <FlatList
          data={fresh}
          keyExtractor={(item) => item.key}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<Text style={styles.empty}>{copy.importEmpty}</Text>}
          renderItem={({ item }) => {
            const selected = chosen.has(item.key);
            return (
              <Pressable
                style={[styles.row, selected && styles.rowSelected]}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: selected }}
                accessibilityLabel={`${item.displayName}, ${item.phone}`}
                onPress={() =>
                  setChosen((current) => {
                    const next = new Set(current);
                    if (!next.delete(item.key)) next.add(item.key);
                    return next;
                  })
                }
              >
                <View style={styles.rowInfo}>
                  <Text style={styles.name}>{item.displayName}</Text>
                  <Text style={styles.phone}>{item.phone}</Text>
                </View>
                <View style={[styles.checkbox, selected && styles.checkboxSelected]}>
                  {selected && (
                    <Text style={styles.checkmark} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                      ✓
                    </Text>
                  )}
                </View>
              </Pressable>
            );
          }}
        />
        <View style={styles.footer}>
          <Text style={styles.count}>{chosen.size} chosen</Text>
          <Pressable
            style={[styles.button, styles.buttonInline, chosen.size === 0 && styles.buttonDisabled]}
            onPress={() => void addChosen(fresh)}
            disabled={chosen.size === 0}
            accessibilityRole="button"
            accessibilityState={{ disabled: chosen.size === 0 }}
          >
            <Text style={styles.buttonText}>Add</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (mode.kind === 'adding') {
    return (
      <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {back}
          <ScreenHeader>Add someone myself</ScreenHeader>
          <Field
            label="Name"
            value={name}
            onChangeText={setName}
            autoCapitalize="words"
            textContentType="name"
            autoComplete="name"
            returnKeyType="next"
            onSubmitEditing={() => phoneRef.current?.focus()}
          />
          <Field
            label="Mobile number"
            value={phone}
            onChangeText={(v) => {
              setPhone(v);
              setError(null);
            }}
            keyboardType="phone-pad"
            textContentType="telephoneNumber"
            autoComplete="tel"
            inputRef={phoneRef}
          />
          <ErrorText message={error} />
          <Pressable
            style={styles.button}
            onPress={() => void addByHand()}
            accessibilityRole="button"
          >
            <Text style={styles.buttonText}>Add</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  const saved = contacts.contacts;
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      {back}
      <ScreenHeader>Who should we be able to reach?</ScreenHeader>
      <Text style={authStyles.body}>
        Start with the few people you'd call first. You can add more any time. Names and numbers stay on this phone.
      </Text>
      <Pressable
        style={[styles.button, importing && styles.buttonDisabled]}
        onPress={() => void importFromPhone()}
        disabled={importing}
        accessibilityRole="button"
        accessibilityLabel="Bring in from my phone"
        accessibilityState={{ disabled: importing, busy: importing }}
      >
        {importing ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.buttonText}>Bring in from my phone</Text>}
      </Pressable>
      <Pressable
        style={[styles.button, styles.buttonOutline]}
        onPress={() => {
          setError(null);
          setMode({ kind: 'adding' });
        }}
        accessibilityRole="button"
      >
        <Text style={styles.buttonOutlineText}>Add someone myself</Text>
      </Pressable>
      <ErrorText message={error} />
      <View accessibilityLiveRegion="polite">{status ? <Text style={styles.status}>{status}</Text> : null}</View>
      {saved.length > 0 && (
        <View style={styles.saved}>
          <Text style={styles.eyebrow} accessibilityRole="header">
            Added so far — {saved.length}
          </Text>
          {saved.map((c) => (
            <View key={c.contactId} style={styles.savedRow}>
              <Text style={styles.name}>{c.name}</Text>
              <Text style={styles.phone}>{c.phone}</Text>
            </View>
          ))}
        </View>
      )}
      <Pressable
        style={styles.button}
        onPress={onContinue}
        accessibilityRole="button"
      >
        <Text style={styles.buttonText}>Done for now</Text>
      </Pressable>
      <Text style={styles.note}>Three is plenty to begin. Nobody needs the whole list today.</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#ffffff' },
  content: { padding: 24, paddingTop: 60, paddingBottom: 40 },
  header: { paddingHorizontal: 24, paddingTop: 60 },
  backRow: { alignSelf: 'flex-start', marginBottom: 16 },
  list: { paddingHorizontal: 24, paddingTop: 12, flexGrow: 1 },
  empty: { fontSize: 13, color: MUTED, textAlign: 'center', marginTop: 24 },
  row: {
    minHeight: 44,
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
    width: 22,
    height: 22,
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
    minHeight: 44,
    backgroundColor: ACCENT,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },
  buttonInline: { marginTop: 0, paddingHorizontal: 24 },
  buttonOutline: { backgroundColor: '#ffffff', borderWidth: 1, borderColor: ACCENT },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { color: '#ffffff', fontSize: 15, fontWeight: '500' },
  buttonOutlineText: { color: ACCENT, fontSize: 15, fontWeight: '500' },
  saved: { marginTop: 24 },
  eyebrow: { fontSize: 13, fontWeight: '600', color: MUTED_STRONG, marginBottom: 8 },
  savedRow: { minHeight: 44, justifyContent: 'center', marginBottom: 4 },
  status: { fontSize: 13, color: MUTED_STRONG, marginTop: 8 },
  note: { fontSize: 12, fontStyle: 'italic', color: MUTED, textAlign: 'center', marginTop: 16 },
});
