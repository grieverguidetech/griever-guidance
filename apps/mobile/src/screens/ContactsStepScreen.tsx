import { colors } from '@griever/tokens';
import { useCallback, useEffect, useRef, useState, type ComponentRef } from 'react';
import type { Text as NativeText } from 'react-native';
import { AccessibilityInfo, BackHandler, findNodeHandle, FlatList, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SerifText as Text, Button, LiveLine } from '../ui';
import type { ButtonNode } from '../ui';
import type { UseContactsResult } from '@griever/hooks';
import { Cancelled, detectDeviceRegion, runImport, toE164 } from '@griever/contacts';
import type { NormalizedContact } from '@griever/contacts';
import { screenCopy } from '@griever/copy';
import { expoContactsSource } from '../lib/expoContactsSource';
import { useRecheckWhenBlocked } from '../lib/useRecheckWhenBlocked';
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
const ADD_FAILED = copy.saveFailed;
const IMPORT_FAILED = 'We could not read your contacts. You can add people by hand instead.';

/**
 * Shown once after setup, only when this phone has no saved contacts (the same rule as web).
 * Contacts stay on the device (C3); only the seven Contact fields are kept (C4).
 */
export function ContactsStepScreen({ contacts, onContinue, onBack, startWithImport = false }: Props) {
  const [mode, setMode] = useState<Mode>({ kind: 'start' });
  const [importing, setImporting] = useState(false);
  const [saving, setSaving] = useState(false);
  // Contacts are turned off for good: only Settings can turn them on.
  const [blocked, setBlocked] = useState(false);
  // Counts each time the refusal is shown, so the line is read and Open Settings takes focus every time.
  const [blockedShown, setBlockedShown] = useState(0);
  const blockedLine = useRef<ComponentRef<typeof NativeText>>(null);
  const importButton = useRef<ButtonNode>(null);
  // At least one person came in from the phone's contacts.
  const [imported, setImported] = useState(false);
  const [query, setQuery] = useState('');
  // A second tap while a read or a save is running does nothing.
  const inFlight = useRef(false);
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

  const focusButton = (node: ButtonNode | ComponentRef<typeof NativeText> | null) => {
    const handle = node ? findNodeHandle(node) : null;
    if (handle) {
      AccessibilityInfo.setAccessibilityFocus(handle);
    }
  };
  useEffect(() => {
    if (blockedShown > 0) {
      // Focus on the line itself, so it is read in full (focus on the button would cut it off on iOS).
      // Open Settings is the next swipe.
      focusButton(blockedLine.current);
    }
  }, [blockedShown]);
  // Back from Settings: if contacts can be read (or asked about) now, drop the line and go to the import button.
  useRecheckWhenBlocked(blocked, () => {
    setBlocked(false);
    focusButton(importButton.current);
  });

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
    if (inFlight.current) {
      return;
    }
    inFlight.current = true;
    setImporting(true);
    setError(null);
    setBlocked(false);
    try {
      const stored = new Set(contacts.contacts.map((c) => c.phone));
      const result = await runImport(expoContactsSource, stored, detectDeviceRegion());
      // Nothing is preselected: the person chooses (as web).
      setChosen(new Set());
      setQuery('');
      setMode({ kind: 'reviewing', fresh: result.fresh });
    } catch (err) {
      if (err instanceof Cancelled) {
        // A plain "no" is nothing chosen. Refused for good needs a line and a way to Settings.
        if (err.reason === 'blocked') {
          setBlocked(true);
          setBlockedShown((n) => n + 1);
        }
      } else {
        setError(IMPORT_FAILED);
      }
    } finally {
      inFlight.current = false;
      setImporting(false);
    }
  }

  async function addChosen(fresh: NormalizedContact[]) {
    if (inFlight.current) {
      return;
    }
    inFlight.current = true;
    setSaving(true);
    setError(null);
    try {
      const picked = fresh
        .filter((c) => chosen.has(c.key))
        .map((c) => ({ name: c.displayName, phone: c.phone, email: c.email, tier: 'family' as const }));
      if (picked.length > 0) {
        await contacts.importContacts(picked, 'native');
        setImported(true);
      }
      say(`${picked.length} added`);
      if (startWithImport) {
        onContinue();
        return;
      }
      setMode({ kind: 'start' });
    } catch {
      setError(ADD_FAILED);
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  }

  async function addByHand() {
    if (inFlight.current) {
      return;
    }
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
    inFlight.current = true;
    setSaving(true);
    try {
      await contacts.addContact({ name: added, phone: e164, tier: 'family' });
      say(`Added ${added}`);
      setName('');
      setPhone('');
      setError(null);
      setMode({ kind: 'start' });
    } catch {
      // The typed name and number stay.
      setError(ADD_FAILED);
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
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
    const needle = query.trim().toLowerCase();
    const shown = needle ? fresh.filter((c) => c.displayName.toLowerCase().includes(needle)) : fresh;
    const none = chosen.size === 0;
    return (
      <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.header}>
          {back}
          <ScreenHeader>{copy.bringAcross}</ScreenHeader>
          <Text style={authStyles.body}>{copy.importIntro}</Text>
          {fresh.length > 0 ? (
            <Field label={copy.searchLabel} value={query} onChangeText={setQuery} returnKeyType="search" autoCorrect={false} autoCapitalize="none" />
          ) : null}
        </View>
        <FlatList
          data={shown}
          keyExtractor={(item) => item.key}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          ListEmptyComponent={
            fresh.length === 0 ? (
              <Text style={styles.empty}>{copy.importEmpty}</Text>
            ) : (
              <View style={styles.empty}>
                <LiveLine label={copy.searchEmpty} />
              </View>
            )
          }
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
        <View style={styles.footerBox}>
          <ErrorText message={error} />
          {none ? <Text style={styles.reason}>{copy.chooseOne}</Text> : null}
          <View style={styles.footer}>
            <Text style={styles.count}>{chosen.size} chosen</Text>
            <Button
              label={copy.add}
              busy={saving}
              busyLabel={copy.saving}
              ariaDisabled={none}
              announceDisabled
              hint={none ? copy.chooseOne : undefined}
              onPress={() => {
                if (!none) {
                  void addChosen(fresh);
                }
              }}
            />
          </View>
        </View>
      </KeyboardAvoidingView>
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
          <View style={styles.gap}>
            <Button label={copy.add} busy={saving} busyLabel={copy.saving} onPress={() => void addByHand()} />
          </View>
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
      <View style={styles.gap}>
        {blocked ? (
          <>
            <Text ref={blockedLine} style={styles.status}>{copy.blockedLine}</Text>
            <View style={styles.gap}>
              <Button label={copy.openSettings} onPress={() => void Linking.openSettings()} />
            </View>
          </>
        ) : null}
        <View style={blocked ? styles.gap : undefined}>
          <Button
            label="Bring in from my phone"
            busy={importing}
            busyLabel={copy.bringAcrossBusy}
            buttonRef={importButton}
            variant={blocked ? 'secondary' : 'primary'}
            onPress={() => void importFromPhone()}
          />
        </View>
      </View>
      <View style={styles.gap}>
        <Button
          label="Add someone myself"
          variant="secondary"
          onPress={() => {
            setError(null);
            setMode({ kind: 'adding' });
          }}
        />
      </View>
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
      <View style={styles.gap}>
        <Button label={imported ? copy.continue : copy.doneForNow} onPress={onContinue} />
      </View>
      <Text style={styles.note}>Three is plenty to begin. Nobody needs the whole list today.</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 24, paddingTop: 20, paddingBottom: 40 },
  header: { paddingHorizontal: 24, paddingTop: 20 },
  backRow: { alignSelf: 'flex-start', marginBottom: 16 },
  list: { paddingHorizontal: 24, paddingTop: 12, flexGrow: 1 },
  empty: { fontSize: 13, color: MUTED, textAlign: 'center', marginTop: 24 },
  reason: { fontSize: 13, color: MUTED_STRONG, paddingHorizontal: 24, paddingTop: 12 },
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
  gap: { marginTop: 12 },
  footerBox: { borderTopWidth: 1, borderTopColor: '#f3f4f6' },
  footer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    padding: 24,
  },
  count: { fontSize: 14, color: MUTED, flexShrink: 1 },
  saved: { marginTop: 24 },
  eyebrow: { fontSize: 13, fontWeight: '600', color: MUTED_STRONG, marginBottom: 8 },
  savedRow: { minHeight: 44, justifyContent: 'center', marginBottom: 4 },
  status: { fontSize: 13, color: MUTED_STRONG, marginTop: 8 },
  note: { fontSize: 12, fontStyle: 'italic', color: MUTED, textAlign: 'center', marginTop: 16 },
});
