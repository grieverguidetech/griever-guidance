import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { Session } from '@griever/hooks';
import { PrimaryButton, ScreenHeader, authStyles } from '../components/authForm';
import { personLabel } from '../components/PersonSwitcher';
import { ACCENT, MUTED } from '../components/colors';
import { isBlank } from '../lib/useDeviceSessions';

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
  onWhatYoullNeed: () => void;
  /** Only given when accounts are on. */
  onAccount?: () => void;
};

/**
 * Where every launch lands. The people kept on this phone, newest first, and one way to add
 * another. Nothing here removes anyone (C9).
 */
export function HomeScreen({ sessions, canCreate, onOpen, onCreate, onWhatYoullNeed, onAccount }: HomeScreenProps) {
  const people = listed(sessions);
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <ScreenHeader>The people you're writing about</ScreenHeader>
      <Pressable style={styles.link} onPress={onWhatYoullNeed} accessibilityRole="button">
        <Text style={styles.linkText}>What you'll need</Text>
      </Pressable>
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
  link: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center', marginBottom: 8 },
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
