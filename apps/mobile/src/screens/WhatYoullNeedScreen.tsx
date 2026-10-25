import { useEffect, useState } from 'react';
import { AccessibilityInfo, View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../app/App';
import { ACCENT, ACCENT_TINT, FIELD_BORDER, MUTED } from '../components/colors';

// Which rows are ticked stays on this phone only. Nothing is sent anywhere, and nothing nags.
export const CHECKLIST_KEY = 'gg.checklist.v1';

// Same words as the web list (a unit test compares the two).
export const SSN_TIP =
  "You'll need this number when you deal with the funeral home, insurance and banks. You do not need to add it to your account.";

const CHECKLIST: { id: string; label: string; meta?: string; tip?: string }[] = [
  { id: 'will', label: 'Any will or written wishes', meta: 'Burial or cremation, and who they named' },
  { id: 'plans', label: 'Pre-arranged funeral plans', meta: 'Many people have already paid for this' },
  { id: 'ssn', label: 'Social Security number and ID', tip: SSN_TIP },
  { id: 'insurance', label: 'Life insurance policies' },
  { id: 'military', label: 'Military discharge papers', meta: 'If they served — it may cover the burial' },
];

/**
 * The tickable rows. Shared by the checklist screen and "Your account", so a tick on one shows on
 * the other: both read and write the same saved ticks. The caller owns which tip is open, so a
 * touch elsewhere on its screen can close it.
 */
export function ChecklistRows({ tipOpen, onTipChange }: { tipOpen: string | null; onTipChange: (id: string | null) => void }) {
  const [ticked, setTicked] = useState<string[]>([]);
  // Rows show once the saved ticks are read, so a tap can never overwrite them with a partial list.
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let live = true;
    AsyncStorage.getItem(CHECKLIST_KEY)
      .then((raw) => {
        const saved: unknown = raw ? JSON.parse(raw) : [];
        if (live && Array.isArray(saved)) setTicked(saved.filter((x): x is string => typeof x === 'string'));
      })
      .catch(() => undefined)
      .finally(() => live && setLoaded(true));
    return () => {
      live = false;
    };
  }, []);

  const toggle = (id: string) => {
    // Computed from the latest ticks, so two quick taps both count.
    onTipChange(null);
    setTicked((prev) => {
      const next = prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id];
      void AsyncStorage.setItem(CHECKLIST_KEY, JSON.stringify(next)).catch(() => undefined);
      return next;
    });
  };

  return (
    <>
      {loaded && CHECKLIST.map((item) => {
        const checked = ticked.includes(item.id);
        return (
          <View key={item.id}>
            <View style={styles.checklistRow}>
              <Pressable
                onPress={() => toggle(item.id)}
                style={({ pressed }) => [styles.checklistItem, styles.checklistMain, pressed && styles.pressed]}
                accessibilityRole="checkbox"
                accessibilityState={{ checked }}
                accessibilityLabel={item.meta ? `${item.label}. ${item.meta}` : item.label}
              >
                <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
                  {checked ? <Text style={styles.checkmark} allowFontScaling={false}>✓</Text> : null}
                </View>
                <View style={styles.checklistText}>
                  <Text style={[styles.checklistLabel, checked && styles.struck]}>{item.label}</Text>
                  {item.meta && <Text style={styles.checklistMeta}>{item.meta}</Text>}
                </View>
              </Pressable>
              {item.tip && (
                <View onTouchStart={(e) => e.stopPropagation()}>
                <Pressable
                  onPress={() => {
                    const opening = tipOpen !== item.id;
                    onTipChange(opening ? item.id : null);
                    // Android reads the live region; iOS VoiceOver needs this announcement.
                    if (opening && item.tip) AccessibilityInfo.announceForAccessibility(item.tip);
                  }}
                  style={({ pressed }) => [styles.infoButton, pressed && styles.pressed]}
                  accessibilityRole="button"
                  accessibilityLabel="Why we list this"
                  accessibilityState={{ expanded: tipOpen === item.id }}
                >
                  <Text style={styles.infoGlyph} allowFontScaling={false}>i</Text>
                </Pressable>
                </View>
              )}
            </View>
            {item.tip && tipOpen === item.id && (
              <Text style={styles.tip} accessibilityLiveRegion="polite">{item.tip}</Text>
            )}
          </View>
        );
      })}
    </>
  );
}

export function WhatYoullNeedScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [tipOpen, setTipOpen] = useState<string | null>(null);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      // A touch anywhere outside the info button closes the tip.
      onTouchStart={() => setTipOpen(null)}
    >
      <Pressable
        onPress={() => navigation.goBack()}
        style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel="Back"
      >
        <Text style={styles.backText}>← Back</Text>
      </Pressable>

      <Text style={styles.title}>What you'll need</Text>
      <Text style={styles.subtitle}>Not today. Just so none of it surprises you.</Text>

      <View style={styles.card}>
        <Text style={styles.cardKicker}>The one people get wrong</Text>
        <Text style={styles.cardTitle}>Certified death certificates</Text>
        <Text style={styles.cardBody}>
          Ask the funeral home for 8 to 10 certified copies. Banks, insurers and Social Security each
          keep an original — photocopies are usually refused.
        </Text>
      </View>

      <Text style={styles.gatherHeading}>Gather when you can</Text>
      <ChecklistRows tipOpen={tipOpen} onTipChange={setTipOpen} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ffffff' },
  content: { padding: 24, paddingTop: 60 },
  backButton: {
    alignSelf: 'flex-start',
    minHeight: 44,
    minWidth: 44,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: ACCENT,
    borderRadius: 10,
    backgroundColor: ACCENT_TINT,
    marginBottom: 24,
  },
  backText: { fontSize: 14, color: ACCENT, fontWeight: '500' },
  title: { fontSize: 20, fontWeight: '600', color: '#111827', marginBottom: 4 },
  subtitle: { fontSize: 13, color: MUTED, marginBottom: 24 },
  card: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
  },
  cardKicker: { fontSize: 11, fontWeight: '500', color: MUTED, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 },
  cardTitle: { fontSize: 15, fontWeight: '500', color: '#111827', marginBottom: 8 },
  cardBody: { fontSize: 14, color: '#374151', lineHeight: 20 },
  gatherHeading: { fontSize: 11, fontWeight: '500', color: MUTED, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 12 },
  checklistItem: { flexDirection: 'row', alignItems: 'flex-start', minHeight: 44, paddingVertical: 8, marginBottom: 8 },
  checklistRow: { flexDirection: 'row', alignItems: 'flex-start' },
  checklistMain: { flex: 1 },
  infoButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  infoGlyph: { width: 22, height: 22, lineHeight: 20, textAlign: 'center', fontSize: 13, fontWeight: '600', color: MUTED, borderWidth: 1.5, borderColor: MUTED, borderRadius: 11, overflow: 'hidden' },
  tip: { fontSize: 12, color: MUTED, lineHeight: 18, marginLeft: 36, marginBottom: 8 },
  checkbox: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: FIELD_BORDER, marginRight: 12, marginTop: 1, alignItems: 'center', justifyContent: 'center' },
  checkmark: { fontSize: 14, color: '#ffffff', fontWeight: '700' },
  pressed: { opacity: 0.7 },
  struck: { textDecorationLine: 'line-through', color: MUTED },
  checkboxChecked: { borderColor: ACCENT, backgroundColor: ACCENT },
  checklistText: { flex: 1 },
  checklistLabel: { fontSize: 14, color: '#111827' },
  checklistMeta: { fontSize: 12, color: MUTED, marginTop: 2 },
});
