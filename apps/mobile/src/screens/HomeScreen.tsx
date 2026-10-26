import { useEffect } from 'react';
import { AccessibilityInfo, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Body, Button, SerifText as Text } from '@griever/ui';
import { colors } from '@griever/tokens';
import type { Session } from '@griever/hooks';
import { PrimaryButton, ScreenHeader } from '../components/authForm';
import { personLabel } from '../components/PersonSwitcher';
import { ACCENT, MUTED } from '../components/colors';
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
        <View style={styles.headerRow}>
          <Button label="What you'll need" variant="header" onPress={onWhatYoullNeed} />
        </View>
      ) : null}
      {people.length > 0 ? (
        <View style={styles.intro}>
          <Body tone="muted">Each person is kept separately on this phone.</Body>
        </View>
      ) : null}
      {people.map((s) => (
        <Pressable
          key={s.id}
          style={styles.row}
          onPress={() => onOpen(s.id)}
          accessibilityRole="button"
          accessibilityLabel={`${personLabel(s)}${s.dateOfPassing ? `, passed ${s.dateOfPassing}` : ''}`}
        >
          <Text style={styles.rowName}>{personLabel(s)}</Text>
          {s.dateOfPassing ? <Body tone="muted" small>{s.dateOfPassing}</Body> : null}
        </Pressable>
      ))}
      {canCreate ? (
        <View style={styles.create}>
          <PrimaryButton label={people.length > 0 ? ADD_PERSON : START_FIRST} pending={false} onPress={onCreate} />
        </View>
      ) : null}
      {onAccount ? (
        // Outline, page showing through: the shared `header` variant (web's top bar look).
        <View style={styles.account}>
          <Button label="Your account" variant="header" onPress={onAccount} />
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 24, paddingTop: 60 },
  headerRow: { alignSelf: 'flex-start', marginBottom: 8 },
  note: { borderWidth: 1, borderColor: MUTED, borderRadius: 10, padding: 16, marginBottom: 16 },
  intro: { marginBottom: 16 },
  noteText: { fontSize: 16, color: colors.ink, marginBottom: 4 },
  noteSmall: { fontSize: 12, color: MUTED },
  row: {
    minHeight: 44,
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: colors['neutral-600'],
    borderRadius: 10,
    backgroundColor: colors.surface,
    marginBottom: 12,
  },
  rowName: { fontSize: 16, color: ACCENT, fontWeight: '500' },
  create: { marginTop: 8 },
  account: { alignSelf: 'flex-start', marginTop: 8 },
});
