import { useEffect } from 'react';
import { AccessibilityInfo, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SerifText as Text } from '@griever/ui';
import type { Session } from '@griever/hooks';
import { PrimaryButton, ScreenHeader, authStyles } from '../components/authForm';
import { personLabel } from '../components/PersonSwitcher';
import { ACCENT, ACCENT_TINT, MUTED } from '../components/colors';
import { isBlank } from '../lib/useDeviceSessions';
import { NO_COPY_LINE } from '../lib/sendNote';

export const START_FIRST = "Start with someone I've lost";
export const ADD_PERSON = "Someone else I've lost";

// Someone with a draft but no name yet still shows (as "Someone new"), so their draft is reachable.
const listed = (sessions: Session[]) =>
  sessions.filter((s) => !isBlank(s)).sort((a, b) => b.lastOpenedAt.localeCompare(a.lastOpenedAt));

export type HomeScreenProps = {
  sessions: Session[];
  /** False for a member who may open people but not add them (B10). */
  canCreate: boolean;
  onOpen: (id: string) => void;
  onCreate: () => void;
  /** Only given while accounts are off. With accounts on, "Your account" holds the list. */
  onWhatYoullNeed?: () => void;
  /** A calm line after the last person of a send was dealt with. Stays until the person leaves Home. */
  note?: string | null;
  /** Only given when accounts are on. */
  onAccount?: () => void;
};

/**
 * Where every launch lands. The people kept on this phone, newest first, and one way to add
 * another. Nothing here removes anyone (C9).
 */
export function HomeScreen({ sessions, canCreate, onOpen, onCreate, onWhatYoullNeed, onAccount, note }: HomeScreenProps) {
  const people = listed(sessions);
  // The header takes screen-reader focus as Home opens. On iOS the note is queued behind it, so it
  // is read rather than dropped. Android reads the live region below.
  useEffect(() => {
    if (note && Platform.OS === 'ios') AccessibilityInfo.announceForAccessibilityWithOptions(note, { queue: true });
  }, [note]);
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <ScreenHeader>Who you're writing about</ScreenHeader>
      {note ? (
        <View
          style={styles.note}
          accessible
          accessibilityLiveRegion="polite"
          accessibilityLabel={`${note} ${NO_COPY_LINE}`}
        >
          <Text style={styles.noteText}>{note}</Text>
          <Text style={styles.noteSmall}>{NO_COPY_LINE}</Text>
        </View>
      ) : null}
      {onWhatYoullNeed ? (
        <Pressable
          style={({ pressed }) => [styles.link, pressed && styles.pressed]}
          onPress={onWhatYoullNeed}
          accessibilityRole="button"
          accessibilityLabel="What you'll need"
        >
          <Text style={styles.linkText}>What you'll need</Text>
        </Pressable>
      ) : null}
      {onAccount ? (
        <Pressable style={styles.link} onPress={onAccount} accessibilityRole="button">
          <Text style={styles.linkText}>Your account</Text>
        </Pressable>
      ) : null}
      {people.length > 0 ? <Text style={authStyles.body}>Each person is kept separately on this phone.</Text> : null}
      {people.map((s) => (
        <Pressable
          key={s.id}
          style={styles.row}
          onPress={() => onOpen(s.id)}
          accessibilityRole="button"
          accessibilityLabel={`${personLabel(s)}${s.dateOfPassing ? `, passed ${s.dateOfPassing}` : ''}`}
        >
          <Text style={styles.rowName}>{personLabel(s)}</Text>
          {s.dateOfPassing ? <Text style={styles.rowMeta}>{s.dateOfPassing}</Text> : null}
        </Pressable>
      ))}
      {canCreate ? (
        <View style={styles.create}>
          <PrimaryButton label={people.length > 0 ? ADD_PERSON : START_FIRST} pending={false} onPress={onCreate} />
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#ffffff' },
  content: { padding: 24, paddingTop: 60 },
  link: {
    alignSelf: 'flex-start',
    minHeight: 44,
    minWidth: 44,
    justifyContent: 'center',
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: ACCENT,
    borderRadius: 10,
    backgroundColor: ACCENT_TINT,
    marginBottom: 8,
  },
  note: { borderWidth: 1, borderColor: MUTED, borderRadius: 10, padding: 16, marginBottom: 16 },
  pressed: { opacity: 0.7 },
  noteText: { fontSize: 16, color: '#111827', marginBottom: 4 },
  noteSmall: { fontSize: 12, color: MUTED },
  linkText: { fontSize: 14, color: ACCENT, fontWeight: '500' },
  row: {
    minHeight: 44,
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: MUTED,
    borderRadius: 10,
    marginBottom: 12,
  },
  rowName: { fontSize: 16, color: ACCENT, fontWeight: '500' },
  rowMeta: { fontSize: 13, color: MUTED, marginTop: 2 },
  create: { marginTop: 8 },
});
